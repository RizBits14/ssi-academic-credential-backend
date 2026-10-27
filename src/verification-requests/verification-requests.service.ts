import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { canonicalizeJson } from '../common/utils/json-canonicalization.util';
import { EncryptionService } from '../crypto/encryption.service';
import { DidService } from '../did/did.service';
import type { Prisma } from '../generated/prisma/client';
import {
  DidOwnerType,
  EducationVerificationStatus,
  VerificationRequestStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface CreateVerificationRequestInput {
  applicationId: string;
  verifierId: string;
  bankId: string;
  requestedClaims: string[];
}

interface ApproveVerificationRequestInput {
  requestId: string;
  holderId: string;
  credentialId: string;
  approvedClaims: string[];
}

interface VerificationSession {
  applicationId: string;
  holderId: string;
  bankId: string;
  nonce: string;
  requestedClaims: string[];
}

interface HolderDataIntegrityProofOptions {
  type: 'DataIntegrityProof';
  cryptosuite: 'eddsa-jcs-2022';
  created: string;
  verificationMethod: string;
  proofPurpose: 'authentication';
  challenge: string;
  domain: string;
}

@Injectable()
export class VerificationRequestsService {
  private readonly ttlSeconds = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly encryptionService: EncryptionService,
    private readonly didService: DidService,
  ) {}

  async create(input: CreateVerificationRequestInput) {
    const application = await this.prisma.application.findFirst({
      where: {
        id: input.applicationId,
        job: {
          is: {
            bankId: input.bankId,
          },
        },
      },
      include: {
        job: true,
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    this.validateRequestedClaims(
      input.requestedClaims,
      application.job.requiredClaims,
    );

    const requestId = randomUUID();
    const nonce = randomBytes(32).toString('hex');

    const nonceHash = createHash('sha256').update(nonce).digest('hex');

    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    const redisKey = `verification-request:${requestId}`;

    await this.redis.setJson(
      redisKey,
      {
        applicationId: input.applicationId,
        holderId: application.holderId,
        bankId: input.bankId,
        nonce,
        requestedClaims: input.requestedClaims,
      },
      this.ttlSeconds,
    );

    try {
      const request = await this.prisma.$transaction(async (transaction) => {
        const applicationUpdate = await transaction.application.updateMany({
          where: {
            id: input.applicationId,
            job: {
              is: {
                bankId: input.bankId,
              },
            },
          },
          data: {
            educationVerificationStatus: EducationVerificationStatus.PENDING,
          },
        });

        if (applicationUpdate.count !== 1) {
          throw new NotFoundException('Application not found');
        }

        const createdRequest = await transaction.verificationRequest.create({
          data: {
            id: requestId,
            applicationId: input.applicationId,
            verifierId: input.verifierId,
            holderId: application.holderId,
            requestedClaims: input.requestedClaims,
            nonceHash,
            status: VerificationRequestStatus.PENDING,
            expiresAt,
          },
        });

        await transaction.auditLog.create({
          data: {
            actorId: input.verifierId,
            organizationId: input.bankId,
            action: 'CREDENTIAL_REQUEST_CREATED',
            resourceType: 'VerificationRequest',
            resourceId: createdRequest.id,
            metadata: {
              applicationId: input.applicationId,
              holderId: application.holderId,
              requestedClaims: input.requestedClaims,
            },
          },
        });

        return createdRequest;
      });

      return {
        requestId: request.id,
        nonce,
        expiresAt: request.expiresAt,
        status: request.status,
        requestedClaims: request.requestedClaims,
      };
    } catch (error) {
      await this.redis.delete(redisKey);

      throw error;
    }
  }

  async findOneForHolder(id: string, holderId: string) {
    const request = await this.prisma.verificationRequest.findFirst({
      where: {
        id,
        holderId,
      },
      include: {
        application: {
          include: {
            job: {
              include: {
                bank: true,
              },
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Verification request not found');
    }

    return request;
  }

  async findOneForBank(id: string, bankId: string) {
    const request = await this.prisma.verificationRequest.findFirst({
      where: {
        id,
        application: {
          is: {
            job: {
              is: {
                bankId,
              },
            },
          },
        },
      },
      include: {
        application: {
          include: {
            job: {
              include: {
                bank: true,
              },
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Verification request not found');
    }

    return request;
  }

  async approve(input: ApproveVerificationRequestInput) {
    const request = await this.prisma.verificationRequest.findFirst({
      where: {
        id: input.requestId,
        holderId: input.holderId,
      },
    });

    if (!request) {
      throw new NotFoundException('Verification request not found');
    }

    await this.ensurePendingAndActive(
      request.id,
      request.status,
      request.expiresAt,
    );

    const redisKey = `verification-request:${request.id}`;

    const session = await this.redis.getJson<VerificationSession>(redisKey);

    if (!session) {
      await this.expireRequest(request.id);

      throw new BadRequestException('Verification request has expired');
    }

    if (
      session.holderId !== input.holderId ||
      session.applicationId !== request.applicationId
    ) {
      throw new ForbiddenException(
        'Verification session does not belong to this holder',
      );
    }

    const approvedClaims = this.validateApprovedClaims(
      input.approvedClaims,
      request.requestedClaims,
    );

    const walletCredential = await this.prisma.walletCredential.findFirst({
      where: {
        credentialId: input.credentialId,
        holderId: input.holderId,
      },
      include: {
        credential: true,
      },
    });

    if (!walletCredential) {
      throw new NotFoundException('Credential not found in holder wallet');
    }

    const decryptedCredential = this.encryptionService.decryptForWallet({
      ciphertext: walletCredential.ciphertext,
      iv: walletCredential.iv,
      authTag: walletCredential.authTag,
      keyId: walletCredential.encryptionKeyId,
    });

    const disclosedClaims = this.extractDisclosedClaims(
      decryptedCredential,
      approvedClaims,
    ) as Prisma.InputJsonObject;

    const presentationId = randomUUID();

    const { holderDid, presentationHash, holderProof } =
      await this.createHolderDataIntegrityProof({
        presentationId,
        requestId: request.id,
        credentialId: input.credentialId,
        holderId: input.holderId,
        bankId: session.bankId,
        challenge: session.nonce,
        disclosedClaims,
        createdAt: new Date(),
      });

    const presentation = await this.prisma.$transaction(async (transaction) => {
      const transition = await transaction.verificationRequest.updateMany({
        where: {
          id: request.id,
          holderId: input.holderId,
          status: VerificationRequestStatus.PENDING,
          expiresAt: {
            gt: new Date(),
          },
        },
        data: {
          status: VerificationRequestStatus.APPROVED,
        },
      });

      if (transition.count !== 1) {
        throw new ConflictException(
          'Verification request is no longer pending or has expired',
        );
      }

      const createdPresentation = await transaction.presentation.create({
        data: {
          id: presentationId,
          requestId: request.id,
          credentialId: input.credentialId,
          holderId: input.holderId,
          holderDid,
          disclosedClaims,
          nonce: session.nonce,
          presentationHash,
          holderProof,
        },
      });

      await transaction.auditLog.create({
        data: {
          actorId: input.holderId,
          organizationId: session.bankId,
          action: 'CREDENTIAL_REQUEST_APPROVED',
          resourceType: 'VerificationRequest',
          resourceId: request.id,
          metadata: {
            applicationId: request.applicationId,
            credentialId: input.credentialId,
            approvedClaims,
          },
        },
      });

      await transaction.auditLog.create({
        data: {
          actorId: input.holderId,
          organizationId: session.bankId,
          action: 'PRESENTATION_CREATED',
          resourceType: 'Presentation',
          resourceId: createdPresentation.id,
          metadata: {
            requestId: request.id,
            applicationId: request.applicationId,
            credentialId: input.credentialId,
            disclosedClaimNames: approvedClaims,
          },
        },
      });

      return createdPresentation;
    });

    return {
      presentationId: presentation.id,
      requestId: request.id,
      status: VerificationRequestStatus.APPROVED,
      disclosedClaims,
    };
  }

  async reject(requestId: string, holderId: string) {
    const request = await this.prisma.verificationRequest.findFirst({
      where: {
        id: requestId,
        holderId,
      },
    });

    if (!request) {
      throw new NotFoundException('Verification request not found');
    }

    await this.ensurePendingAndActive(
      request.id,
      request.status,
      request.expiresAt,
    );

    const redisKey = `verification-request:${request.id}`;

    const session = await this.redis.getJson<VerificationSession>(redisKey);

    if (!session) {
      await this.expireRequest(request.id);

      throw new BadRequestException('Verification request has expired');
    }

    if (
      session.holderId !== holderId ||
      session.applicationId !== request.applicationId
    ) {
      throw new ForbiddenException(
        'Verification session does not belong to this holder',
      );
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const transition = await transaction.verificationRequest.updateMany({
        where: {
          id: request.id,
          holderId,
          status: VerificationRequestStatus.PENDING,
          expiresAt: {
            gt: new Date(),
          },
        },
        data: {
          status: VerificationRequestStatus.REJECTED,
        },
      });

      if (transition.count !== 1) {
        throw new ConflictException(
          'Verification request is no longer pending or has expired',
        );
      }

      await transaction.auditLog.create({
        data: {
          actorId: holderId,
          organizationId: session.bankId,
          action: 'CREDENTIAL_REQUEST_REJECTED',
          resourceType: 'VerificationRequest',
          resourceId: request.id,
          metadata: {
            applicationId: request.applicationId,
          },
        },
      });

      return {
        id: request.id,
        status: VerificationRequestStatus.REJECTED,
      };
    });

    await this.redis.delete(redisKey);

    return {
      requestId: updated.id,
      status: updated.status,
    };
  }

  private async ensurePendingAndActive(
    requestId: string,
    status: VerificationRequestStatus,
    expiresAt: Date,
  ): Promise<void> {
    if (status !== VerificationRequestStatus.PENDING) {
      throw new ConflictException('Verification request is no longer pending');
    }

    if (expiresAt.getTime() <= Date.now()) {
      await this.expireRequest(requestId);

      throw new BadRequestException('Verification request has expired');
    }
  }

  private async expireRequest(requestId: string): Promise<void> {
    await this.prisma.verificationRequest.updateMany({
      where: {
        id: requestId,
        status: VerificationRequestStatus.PENDING,
      },
      data: {
        status: VerificationRequestStatus.EXPIRED,
      },
    });

    await this.redis.delete(`verification-request:${requestId}`);
  }

  private async createHolderDataIntegrityProof(input: {
    presentationId: string;
    requestId: string;
    credentialId: string;
    holderId: string;
    bankId: string;
    challenge: string;
    disclosedClaims: Prisma.InputJsonObject;
    createdAt: Date;
  }): Promise<{
    holderDid: string;
    presentationHash: string;
    holderProof: Prisma.InputJsonObject;
  }> {
    const maximumSigningAttempts = 3;

    for (let attempt = 1; attempt <= maximumSigningAttempts; attempt += 1) {
      const didRecord = await this.didService.findPublicByOwner(
        DidOwnerType.USER,
        input.holderId,
      );

      if (!didRecord) {
        throw new NotFoundException('Holder DID not found');
      }

      const verificationMethod = `${didRecord.did}#key-${didRecord.currentKeyVersion}`;

      const unsecuredPresentation = {
        presentationId: input.presentationId,
        requestId: input.requestId,
        credentialId: input.credentialId,
        holderDid: didRecord.did,
        disclosedClaims: input.disclosedClaims,
      };

      const canonicalPresentation = this.canonicalize(unsecuredPresentation);

      const presentationHash = createHash('sha256')
        .update(canonicalPresentation, 'utf8')
        .digest('hex');

      const proofOptions: HolderDataIntegrityProofOptions = {
        type: 'DataIntegrityProof',
        cryptosuite: 'eddsa-jcs-2022',
        created: input.createdAt.toISOString(),
        verificationMethod,
        proofPurpose: 'authentication',
        challenge: input.challenge,
        domain: input.bankId,
      };

      const hashData = this.createEddsaJcs2022HashData(
        unsecuredPresentation,
        proofOptions,
      );

      const signingResult = await this.didService.signForUser(
        input.holderId,
        hashData,
      );

      const actualVerificationMethod = `${signingResult.did}#key-${signingResult.keyVersion}`;

      if (actualVerificationMethod !== verificationMethod) {
        if (attempt < maximumSigningAttempts) {
          continue;
        }

        throw new ConflictException(
          'Holder DID key changed during presentation signing; retry approval',
        );
      }

      return {
        holderDid: didRecord.did,
        presentationHash,
        holderProof: {
          ...proofOptions,
          proofValue: this.signatureToMultibase(signingResult.signature),
        },
      };
    }

    throw new ConflictException(
      'Unable to obtain a stable holder DID signing key',
    );
  }

  private createEddsaJcs2022HashData(
    unsecuredPresentation: Record<string, unknown>,
    proofOptions: HolderDataIntegrityProofOptions,
  ): Buffer {
    const transformedDocument = this.canonicalize(unsecuredPresentation);

    const canonicalProofConfig = this.canonicalize(proofOptions);

    const transformedDocumentHash = createHash('sha256')
      .update(transformedDocument, 'utf8')
      .digest();

    const proofConfigHash = createHash('sha256')
      .update(canonicalProofConfig, 'utf8')
      .digest();

    return Buffer.concat([proofConfigHash, transformedDocumentHash]);
  }

  private signatureToMultibase(base64Signature: string): string {
    const signatureBytes = Buffer.from(base64Signature, 'base64');

    if (signatureBytes.length !== 64) {
      throw new ConflictException('Ed25519 signature must be exactly 64 bytes');
    }

    return `z${this.encodeBase58(signatureBytes)}`;
  }

  private encodeBase58(value: Uint8Array): string {
    const alphabet =
      '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

    if (value.length === 0) {
      return '';
    }

    let numericValue = 0n;

    for (const byte of value) {
      numericValue = numericValue * 256n + BigInt(byte);
    }

    let encoded = '';

    while (numericValue > 0n) {
      const remainder = Number(numericValue % 58n);

      encoded = alphabet[remainder] + encoded;
      numericValue /= 58n;
    }

    let leadingZeroCount = 0;

    for (const byte of value) {
      if (byte !== 0) {
        break;
      }

      leadingZeroCount += 1;
    }

    return '1'.repeat(leadingZeroCount) + encoded;
  }

  private validateApprovedClaims(
    approvedClaims: string[],
    requestedClaims: unknown,
  ): string[] {
    const normalized = approvedClaims.map((claim) => claim.trim());

    if (
      normalized.length === 0 ||
      normalized.some((claim) => claim.length === 0)
    ) {
      throw new BadRequestException('Approved claims cannot be empty');
    }

    if (new Set(normalized).size !== normalized.length) {
      throw new BadRequestException('Approved claims must be unique');
    }

    if (
      !Array.isArray(requestedClaims) ||
      !requestedClaims.every((claim) => typeof claim === 'string')
    ) {
      throw new BadRequestException('Stored requested claims are invalid');
    }

    const unauthorized = normalized.filter(
      (claim) => !requestedClaims.includes(claim),
    );

    if (unauthorized.length > 0) {
      throw new BadRequestException(
        'Approved claims must be a subset of requested claims',
      );
    }

    return normalized;
  }

  private extractDisclosedClaims(
    credentialJson: string,
    approvedClaims: string[],
  ): Record<string, unknown> {
    let credential: unknown;

    try {
      credential = JSON.parse(credentialJson) as unknown;
    } catch {
      throw new BadRequestException('Stored credential is invalid');
    }

    if (!this.isRecord(credential)) {
      throw new BadRequestException('Stored credential is invalid');
    }

    const credentialSubject = credential.credentialSubject;

    if (!this.isRecord(credentialSubject)) {
      throw new BadRequestException('Credential subject is invalid');
    }

    const issuer = this.isRecord(credential.issuer) ? credential.issuer : null;

    const disclosedClaims: Record<string, unknown> = {};

    for (const claim of approvedClaims) {
      if (claim === 'university' && issuer && typeof issuer.name === 'string') {
        disclosedClaims[claim] = issuer.name;

        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(credentialSubject, claim)) {
        throw new BadRequestException(
          `Credential does not contain claim: ${claim}`,
        );
      }

      disclosedClaims[claim] = credentialSubject[claim];
    }

    return disclosedClaims;
  }

  private validateRequestedClaims(
    requestedClaims: string[],
    requiredClaims: unknown,
  ): void {
    if (requestedClaims.length === 0) {
      throw new BadRequestException('At least one claim must be requested');
    }

    const normalized = requestedClaims.map((claim) => claim.trim());

    if (normalized.some((claim) => claim.length === 0)) {
      throw new BadRequestException('Requested claims cannot be empty');
    }

    if (new Set(normalized).size !== normalized.length) {
      throw new BadRequestException('Requested claims must be unique');
    }

    if (!Array.isArray(requiredClaims)) {
      throw new BadRequestException('Job required claims are invalid');
    }

    const allowedClaims = requiredClaims.filter(
      (claim): claim is string => typeof claim === 'string',
    );

    const unauthorizedClaims = normalized.filter(
      (claim) => !allowedClaims.includes(claim),
    );

    if (unauthorizedClaims.length > 0) {
      throw new BadRequestException(
        'Requested claims must be part of the job required claims',
      );
    }
  }

  private canonicalize(value: unknown): string {
    try {
      return canonicalizeJson(value);
    } catch {
      throw new BadRequestException('Unable to canonicalize presentation');
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
