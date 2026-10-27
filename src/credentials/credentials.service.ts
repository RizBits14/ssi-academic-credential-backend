import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import { canonicalizeJson } from '../common/utils/json-canonicalization.util';
import { EncryptionService } from '../crypto/encryption.service';
import { HashingService } from '../crypto/hashing.service';
import { DidService } from '../did/did.service';
import { DidOwnerType } from '../generated/prisma/enums';

interface BuildAcademicCredentialInput {
  issuerDid: string;
  issuerName: string;
  holderDid: string;

  fullName: string;
  studentId: string;
  degree: string;
  department?: string;
  major: string;
  cgpa?: number;
  graduationYear: number;

  schemaName: string;
  schemaVersion: string;

  issuedAt: Date;
}

interface DataIntegrityProofOptions {
  type: 'DataIntegrityProof';
  cryptosuite: 'eddsa-jcs-2022';
  created: string;
  verificationMethod: string;
  proofPurpose: 'assertionMethod';
  '@context'?: unknown;
}

@Injectable()
export class CredentialsService {
  constructor(
    private readonly hashingService: HashingService,
    private readonly didService: DidService,
    private readonly encryptionService: EncryptionService,
  ) {}

  buildUnsignedAcademicCredential(input: BuildAcademicCredentialInput) {
    return {
      '@context': ['https://www.w3.org/ns/credentials/v2'],

      id: `urn:uuid:${randomUUID()}`,

      type: ['VerifiableCredential', input.schemaName],

      issuer: {
        id: input.issuerDid,
        name: input.issuerName,
      },

      validFrom: input.issuedAt.toISOString(),

      credentialSubject: {
        id: input.holderDid,
        fullName: input.fullName,
        studentId: input.studentId,
        degree: input.degree,

        ...(input.department !== undefined
          ? {
              department: input.department,
            }
          : {}),

        major: input.major,

        ...(input.cgpa !== undefined
          ? {
              cgpa: input.cgpa,
            }
          : {}),

        graduationYear: input.graduationYear,
      },

      metadata: {
        schema: input.schemaName,
        schemaVersion: input.schemaVersion,
      },
    };
  }

  async addIssuerProof(
    organizationId: string,
    unsignedCredential: Record<string, unknown>,
    createdAt: Date,
  ) {
    /*
     * A proof configuration includes the verificationMethod.
     *
     * We therefore need to know the currently selected DID key before
     * preparing the eddsa-jcs-2022 signing input.
     *
     * The signing operation returns the key version it actually used.
     * If a concurrent DID rotation occurs between these operations,
     * retry instead of returning a proof that references a different key.
     */
    const maximumSigningAttempts = 3;

    for (let attempt = 1; attempt <= maximumSigningAttempts; attempt += 1) {
      const didRecord = await this.didService.findPublicByOwner(
        DidOwnerType.ORGANIZATION,
        organizationId,
      );

      if (!didRecord) {
        throw new NotFoundException('Organization DID not found');
      }

      this.assertCredentialIssuer(unsignedCredential, didRecord.did);

      const verificationMethod = `${didRecord.did}#key-${didRecord.currentKeyVersion}`;

      const proofOptions: DataIntegrityProofOptions = {
        type: 'DataIntegrityProof',
        cryptosuite: 'eddsa-jcs-2022',
        created: createdAt.toISOString(),
        verificationMethod,
        proofPurpose: 'assertionMethod',

        ...(Object.prototype.hasOwnProperty.call(unsignedCredential, '@context')
          ? {
              '@context': unsignedCredential['@context'],
            }
          : {}),
      };

      const hashData = this.createEddsaJcs2022HashData(
        unsignedCredential,
        proofOptions,
      );

      const signingResult = await this.didService.signForOrganization(
        organizationId,
        hashData,
      );

      const actualVerificationMethod = `${signingResult.did}#key-${signingResult.keyVersion}`;

      if (actualVerificationMethod !== verificationMethod) {
        if (attempt < maximumSigningAttempts) {
          continue;
        }

        throw new ConflictException(
          'Organization DID key changed during credential signing; retry issuance',
        );
      }

      const proofValue = this.signatureToMultibase(signingResult.signature);

      return {
        ...unsignedCredential,

        proof: {
          ...proofOptions,
          proofValue,
        },
      };
    }

    throw new ConflictException(
      'Unable to obtain a stable organization DID signing key',
    );
  }

  encryptCredentialForWallet(signedCredential: Record<string, unknown>) {
    const plaintext = JSON.stringify(signedCredential);

    return this.encryptionService.encryptForWallet(plaintext);
  }

  canonicalize(value: unknown): string {
    return canonicalizeJson(value);
  }

  hashCredential(unsignedCredential: unknown): string {
    const canonicalCredential = this.canonicalize(unsignedCredential);

    return this.hashingService.sha256(canonicalCredential);
  }

  private createEddsaJcs2022HashData(
    unsignedCredential: Record<string, unknown>,
    proofOptions: DataIntegrityProofOptions,
  ): Buffer {
    /*
     * W3C Data Integrity EdDSA Cryptosuites v1.0:
     *
     * 1. JCS-canonicalize the unsecured document.
     * 2. JCS-canonicalize the proof configuration.
     * 3. SHA-256 each canonical representation.
     * 4. Concatenate:
     *
     *      proofConfigHash || transformedDocumentHash
     *
     * The result is exactly 64 bytes and is the value signed
     * using Ed25519 PureEdDSA.
     */

    const transformedDocument = canonicalizeJson(unsignedCredential);

    const canonicalProofConfig = canonicalizeJson(proofOptions);

    const transformedDocumentHash = createHash('sha256')
      .update(transformedDocument, 'utf8')
      .digest();

    const proofConfigHash = createHash('sha256')
      .update(canonicalProofConfig, 'utf8')
      .digest();

    return Buffer.concat([proofConfigHash, transformedDocumentHash]);
  }

  private assertCredentialIssuer(
    unsignedCredential: Record<string, unknown>,
    expectedIssuerDid: string,
  ): void {
    const issuer = unsignedCredential['issuer'];

    let issuerDid: string | undefined;

    if (typeof issuer === 'string') {
      issuerDid = issuer;
    } else if (
      typeof issuer === 'object' &&
      issuer !== null &&
      'id' in issuer
    ) {
      const issuerId = (issuer as { id?: unknown }).id;

      if (typeof issuerId === 'string') {
        issuerDid = issuerId;
      }
    }

    if (issuerDid !== expectedIssuerDid) {
      throw new ConflictException(
        'Credential issuer does not match organization DID',
      );
    }
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
}
