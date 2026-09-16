import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

import { CredentialSchemasService } from '../credential-schemas/credential-schemas.service';
import { EncryptionService } from '../crypto/encryption.service';
import { SignatureService } from '../crypto/signature.service';
import { DidService } from '../did/did.service';
import {
  CredentialStatus,
  VerificationRequestStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TrustRegistryService } from '../trust-registry/trust-registry.service';

interface VerificationSession {
  applicationId: string;
  holderId: string;
  bankId: string;
  nonce: string;
  requestedClaims: string[];
}

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly encryptionService: EncryptionService,
    private readonly signatureService: SignatureService,
    private readonly didService: DidService,
    private readonly trustRegistryService: TrustRegistryService,
    private readonly credentialSchemasService: CredentialSchemasService,
  ) {}

  async validateRequestContext(presentationId: string) {
    const presentation = await this.prisma.presentation.findUnique({
      where: {
        id: presentationId,
      },
      include: {
        request: {
          include: {
            application: true,
          },
        },
        credential: true,
      },
    });

    if (!presentation) {
      throw new NotFoundException('Presentation not found');
    }

    const request = presentation.request;

    if (
      request.status === VerificationRequestStatus.VERIFIED ||
      request.status === VerificationRequestStatus.FAILED ||
      request.status === VerificationRequestStatus.REJECTED
    ) {
      throw new ConflictException(
        'Verification request has already been consumed',
      );
    }

    if (request.status !== VerificationRequestStatus.APPROVED) {
      throw new ConflictException('Verification request is not approved');
    }

    if (request.expiresAt.getTime() <= Date.now()) {
      await this.prisma.verificationRequest.update({
        where: {
          id: request.id,
        },
        data: {
          status: VerificationRequestStatus.EXPIRED,
        },
      });

      await this.redis.delete(`verification-request:${request.id}`);

      throw new BadRequestException('Verification request has expired');
    }

    const session = await this.redis.getJson<VerificationSession>(
      `verification-request:${request.id}`,
    );

    if (!session) {
      throw new BadRequestException(
        'Verification session not found or expired',
      );
    }

    const nonceHash = createHash('sha256')
      .update(presentation.nonce)
      .digest('hex');

    const nonceValid =
      session.nonce === presentation.nonce && nonceHash === request.nonceHash;

    if (!nonceValid) {
      throw new BadRequestException(
        'Presentation nonce does not match verification request',
      );
    }

    const holderMatches =
      request.holderId === presentation.holderId &&
      request.application.holderId === presentation.holderId &&
      session.holderId === presentation.holderId;

    if (!holderMatches) {
      throw new BadRequestException(
        'Holder does not match verification request',
      );
    }

    if (session.applicationId !== request.applicationId) {
      throw new BadRequestException(
        'Verification session application mismatch',
      );
    }

    return {
      presentation,
      request,
      session,
      checks: {
        requestValid: true,
        nonceValid: true,
        holderMatches: true,
      },
    };
  }

  async validateCryptographicChecks(presentationId: string) {
    const context = await this.validateRequestContext(presentationId);

    const { presentation, request } = context;

    const holderProof = this.requireRecord(
      presentation.holderProof,
      'Holder proof is invalid',
    );

    const holderSignature = holderProof.signature;
    const holderVerificationMethod = holderProof.verificationMethod;

    if (
      typeof holderSignature !== 'string' ||
      typeof holderVerificationMethod !== 'string'
    ) {
      throw new BadRequestException('Holder proof is invalid');
    }

    const holderDidDocument = await this.didService.resolveDid(
      presentation.holderDid,
    );

    if (holderVerificationMethod !== holderDidDocument.verificationMethod.id) {
      throw new BadRequestException(
        'Holder verification method does not match holder DID',
      );
    }

    const holderSigningPayload = {
      presentationId: presentation.id,
      requestId: request.id,
      nonce: presentation.nonce,
      credentialId: presentation.credentialId,
      disclosedClaims: presentation.disclosedClaims,
    };

    const canonicalHolderPayload = this.canonicalize(holderSigningPayload);

    const holderProofValid = this.signatureService.verify(
      canonicalHolderPayload,
      holderSignature,
      holderDidDocument.verificationMethod.publicKey,
    );

    if (!holderProofValid) {
      throw new BadRequestException('Holder proof is invalid');
    }

    const walletCredential = await this.prisma.walletCredential.findFirst({
      where: {
        credentialId: presentation.credentialId,
        holderId: presentation.holderId,
      },
    });

    if (!walletCredential) {
      throw new NotFoundException('Credential not found in holder wallet');
    }

    const decryptedCredential = this.encryptionService.decrypt({
      ciphertext: walletCredential.ciphertext,
      iv: walletCredential.iv,
      authTag: walletCredential.authTag,
    });

    const signedCredential = this.parseJsonObject(
      decryptedCredential,
      'Stored credential is invalid',
    );

    const proof = this.requireRecord(
      signedCredential.proof,
      'Issuer proof is invalid',
    );

    const proofValue = proof.proofValue;
    const issuerVerificationMethod = proof.verificationMethod;

    if (
      typeof proofValue !== 'string' ||
      typeof issuerVerificationMethod !== 'string'
    ) {
      throw new BadRequestException('Issuer proof is invalid');
    }

    const unsignedCredential: Record<string, unknown> = {
      ...signedCredential,
    };

    delete unsignedCredential.proof;

    const canonicalCredential = this.canonicalize(unsignedCredential);

    const calculatedCredentialHash = createHash('sha256')
      .update(canonicalCredential)
      .digest('hex');

    const hashValid =
      calculatedCredentialHash === presentation.credential.credentialHash;

    if (!hashValid) {
      throw new BadRequestException('Credential hash is invalid');
    }

    const issuerDidDocument = await this.didService.resolveDid(
      presentation.credential.issuerDid,
    );

    if (issuerVerificationMethod !== issuerDidDocument.verificationMethod.id) {
      throw new BadRequestException(
        'Issuer verification method does not match issuer DID',
      );
    }

    const issuerSignatureValid = this.signatureService.verify(
      canonicalCredential,
      proofValue,
      issuerDidDocument.verificationMethod.publicKey,
    );

    if (!issuerSignatureValid) {
      throw new BadRequestException('Issuer signature is invalid');
    }

    return {
      ...context,
      signedCredential,
      unsignedCredential,
      checks: {
        ...context.checks,
        holderProofValid: true,
        hashValid: true,
        issuerSignatureValid: true,
      },
    };
  }

  async validateCredentialChecks(presentationId: string) {
    const context = await this.validateCryptographicChecks(presentationId);

    const { presentation, request, session, unsignedCredential } = context;

    const credential = presentation.credential;

    const issuerTrusted = await this.trustRegistryService.isTrusted(
      credential.issuerDid,
    );

    if (!issuerTrusted) {
      throw new BadRequestException('Credential issuer is not trusted');
    }

    if (credential.status === CredentialStatus.REVOKED) {
      throw new BadRequestException('Credential has been revoked');
    }

    if (credential.status === CredentialStatus.SUSPENDED) {
      throw new BadRequestException('Credential has been suspended');
    }

    if (credential.status === CredentialStatus.EXPIRED) {
      throw new BadRequestException('Credential has expired');
    }

    if (credential.status !== CredentialStatus.ACTIVE) {
      throw new BadRequestException('Credential is not active');
    }

    if (credential.expiresAt && credential.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Credential has expired');
    }

    const schema = await this.credentialSchemasService.findById(
      credential.schemaId,
    );

    if (schema.organizationId !== credential.issuerOrganizationId) {
      throw new BadRequestException(
        'Credential schema does not belong to issuer',
      );
    }

    if (schema.status !== 'ACTIVE') {
      throw new BadRequestException('Credential schema is not active');
    }

    const credentialSubject = this.requireRecord(
      unsignedCredential.credentialSubject,
      'Credential subject is invalid',
    );

    const issuer = this.requireRecord(
      unsignedCredential.issuer,
      'Credential issuer is invalid',
    );

    if (issuer.id !== credential.issuerDid) {
      throw new BadRequestException(
        'Credential issuer DID does not match stored issuer',
      );
    }

    if (
      credentialSubject.id !== presentation.holderDid ||
      credentialSubject.id !== credential.holderDid
    ) {
      throw new BadRequestException(
        'Credential holder DID does not match presentation holder',
      );
    }

    const metadata = this.requireRecord(
      unsignedCredential.metadata,
      'Credential metadata is invalid',
    );

    if (
      metadata.schema !== schema.name ||
      metadata.schemaVersion !== schema.version
    ) {
      throw new BadRequestException('Credential schema metadata is invalid');
    }

    const credentialClaims: Record<string, unknown> = {
      ...credentialSubject,
    };

    if (typeof issuer.name === 'string') {
      credentialClaims.university = issuer.name;
    }

    this.credentialSchemasService.validateClaims(
      schema.schemaJson,
      credentialClaims,
    );

    const disclosedClaims = this.requireRecord(
      presentation.disclosedClaims,
      'Disclosed claims are invalid',
    );

    const disclosedClaimNames = Object.keys(disclosedClaims);

    if (disclosedClaimNames.length === 0) {
      throw new BadRequestException('No claims were disclosed');
    }

    const databaseRequestedClaims = this.requireStringArray(
      request.requestedClaims,
      'Stored requested claims are invalid',
    );

    const sessionRequestedClaims = this.requireStringArray(
      session.requestedClaims,
      'Verification session requested claims are invalid',
    );

    if (!this.sameStringSet(databaseRequestedClaims, sessionRequestedClaims)) {
      throw new BadRequestException(
        'Verification session requested claims mismatch',
      );
    }

    for (const claim of disclosedClaimNames) {
      if (
        !databaseRequestedClaims.includes(claim) ||
        !sessionRequestedClaims.includes(claim)
      ) {
        throw new BadRequestException(
          `Disclosed claim was not requested: ${claim}`,
        );
      }

      if (!Object.prototype.hasOwnProperty.call(credentialClaims, claim)) {
        throw new BadRequestException(
          `Credential does not contain disclosed claim: ${claim}`,
        );
      }

      const disclosedValue = disclosedClaims[claim];
      const credentialValue = credentialClaims[claim];

      if (
        this.canonicalize(disclosedValue) !== this.canonicalize(credentialValue)
      ) {
        throw new BadRequestException(
          `Disclosed claim does not match credential: ${claim}`,
        );
      }
    }

    return {
      ...context,
      schema,
      credentialClaims,
      checks: {
        ...context.checks,
        issuerTrusted: true,
        credentialStatusValid: true,
        credentialNotExpired: true,
        schemaValid: true,
        holderMatches: true,
        claimsValid: true,
      },
    };
  }

  private requireStringArray(value: unknown, errorMessage: string): string[] {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      !value.every((item) => typeof item === 'string' && item.length > 0)
    ) {
      throw new BadRequestException(errorMessage);
    }

    return value as string[];
  }

  private sameStringSet(first: string[], second: string[]): boolean {
    if (first.length !== second.length) {
      return false;
    }

    const firstSorted = [...first].sort();
    const secondSorted = [...second].sort();

    return firstSorted.every((value, index) => value === secondSorted[index]);
  }

  private canonicalize(value: unknown): string {
    return JSON.stringify(this.sortValue(value));
  }

  private sortValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortValue(item));
    }

    if (typeof value === 'object' && value !== null) {
      const object = value as Record<string, unknown>;

      return Object.keys(object)
        .sort()
        .reduce<Record<string, unknown>>((result, key) => {
          result[key] = this.sortValue(object[key]);

          return result;
        }, {});
    }

    return value;
  }

  private parseJsonObject(
    value: string,
    errorMessage: string,
  ): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value) as unknown;

      return this.requireRecord(parsed, errorMessage);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(errorMessage);
    }
  }

  private requireRecord(
    value: unknown,
    errorMessage: string,
  ): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new BadRequestException(errorMessage);
    }

    return value as Record<string, unknown>;
  }
}
