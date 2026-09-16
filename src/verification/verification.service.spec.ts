import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { EncryptionService } from '../crypto/encryption.service';
import { SignatureService } from '../crypto/signature.service';
import { DidService } from '../did/did.service';
import {
  CredentialStatus,
  VerificationRequestStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { VerificationService } from './verification.service';
import { CredentialSchemasService } from '../credential-schemas/credential-schemas.service';
import { TrustRegistryService } from '../trust-registry/trust-registry.service';

describe('VerificationService', () => {
  const futureDate = new Date(Date.now() + 60_000);

  const nonce = 'test-nonce';

  const nonceHash = createHash('sha256').update(nonce).digest('hex');

  it('should validate trust, credential status, schema, holder, and disclosed claims', async () => {
    const unsignedCredential = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      id: 'urn:uuid:credential',
      type: ['VerifiableCredential', 'AcademicCredential'],
      issuer: {
        id: 'did:mock:university:issuer-id',
        name: 'Example University',
      },
      validFrom: '2026-09-16T00:00:00.000Z',
      credentialSubject: {
        id: 'did:mock:holder:holder-id',
        fullName: 'Test Holder',
        studentId: '20260001',
        degree: 'BSc',
        major: 'Computer Science',
        cgpa: 3.75,
        graduationYear: 2026,
      },
      metadata: {
        schema: 'AcademicCredential',
        schemaVersion: '1.0',
      },
    };

    const sortValue = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        return value.map((item) => sortValue(item));
      }

      if (typeof value === 'object' && value !== null) {
        const object = value as Record<string, unknown>;

        return Object.keys(object)
          .sort()
          .reduce<Record<string, unknown>>((result, key) => {
            result[key] = sortValue(object[key]);

            return result;
          }, {});
      }

      return value;
    };

    const canonicalCredential = JSON.stringify(sortValue(unsignedCredential));

    const credentialHash = createHash('sha256')
      .update(canonicalCredential)
      .digest('hex');

    mockPrismaService.presentation.findUnique.mockResolvedValue({
      id: 'presentation-id',
      requestId: 'request-id',
      credentialId: 'credential-id',
      holderId: 'holder-id',
      holderDid: 'did:mock:holder:holder-id',
      nonce,
      disclosedClaims: {
        degree: 'BSc',
        major: 'Computer Science',
        cgpa: 3.75,
      },
      holderProof: {
        algorithm: 'Ed25519',
        verificationMethod: 'did:mock:holder:holder-id#key-1',
        signature: 'holder-signature',
      },
      credential: {
        id: 'credential-id',
        issuerOrganizationId: 'university-org-id',
        issuerDid: 'did:mock:university:issuer-id',
        holderDid: 'did:mock:holder:holder-id',
        schemaId: 'schema-id',
        credentialHash,
        status: CredentialStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
      },
      request: {
        id: 'request-id',
        holderId: 'holder-id',
        applicationId: 'application-id',
        requestedClaims: ['degree', 'major', 'cgpa'],
        nonceHash,
        status: VerificationRequestStatus.APPROVED,
        expiresAt: futureDate,
        application: {
          id: 'application-id',
          holderId: 'holder-id',
        },
      },
    });

    mockRedisService.getJson.mockResolvedValue({
      applicationId: 'application-id',
      holderId: 'holder-id',
      bankId: 'bank-id',
      nonce,
      requestedClaims: ['degree', 'major', 'cgpa'],
    });

    mockPrismaService.walletCredential.findFirst.mockResolvedValue({
      ciphertext: 'ciphertext',
      iv: 'iv',
      authTag: 'auth-tag',
    });

    mockEncryptionService.decrypt.mockReturnValue(
      JSON.stringify({
        ...unsignedCredential,
        proof: {
          type: 'Ed25519Signature',
          verificationMethod: 'did:mock:university:issuer-id#key-1',
          proofValue: 'issuer-signature',
        },
      }),
    );

    mockDidService.resolveDid
      .mockResolvedValueOnce({
        id: 'did:mock:holder:holder-id',
        verificationMethod: {
          id: 'did:mock:holder:holder-id#key-1',
          publicKey: 'holder-public-key',
        },
      })
      .mockResolvedValueOnce({
        id: 'did:mock:university:issuer-id',
        verificationMethod: {
          id: 'did:mock:university:issuer-id#key-1',
          publicKey: 'issuer-public-key',
        },
      });

    mockSignatureService.verify
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);

    mockTrustRegistryService.isTrusted.mockResolvedValue(true);

    mockCredentialSchemasService.findById.mockResolvedValue({
      id: 'schema-id',
      organizationId: 'university-org-id',
      name: 'AcademicCredential',
      version: '1.0',
      status: 'ACTIVE',
      schemaJson: {
        name: 'AcademicCredential',
        version: '1.0',
        requiredClaims: [
          'fullName',
          'studentId',
          'university',
          'degree',
          'major',
          'graduationYear',
        ],
      },
    });

    const result = await service.validateCredentialChecks('presentation-id');

    expect(result.checks).toEqual({
      requestValid: true,
      nonceValid: true,
      holderMatches: true,
      holderProofValid: true,
      hashValid: true,
      issuerSignatureValid: true,
      issuerTrusted: true,
      credentialStatusValid: true,
      credentialNotExpired: true,
      schemaValid: true,
      claimsValid: true,
    });

    expect(mockCredentialSchemasService.validateClaims).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        degree: 'BSc',
        major: 'Computer Science',
        university: 'Example University',
      }),
    );
  });

  it('should reject an untrusted credential issuer', async () => {
    mockTrustRegistryService.isTrusted.mockResolvedValue(false);

    jest.spyOn(service, 'validateCryptographicChecks').mockResolvedValueOnce({
      presentation: {
        credential: {
          issuerDid: 'did:mock:university:issuer-id',
        },
      },
    } as never);

    await expect(
      service.validateCredentialChecks('presentation-id'),
    ).rejects.toThrow('Credential issuer is not trusted');
  });

  it('should reject a revoked credential', async () => {
    mockTrustRegistryService.isTrusted.mockResolvedValue(true);

    jest.spyOn(service, 'validateCryptographicChecks').mockResolvedValueOnce({
      presentation: {
        credential: {
          issuerDid: 'did:mock:university:issuer-id',
          status: CredentialStatus.REVOKED,
        },
      },
    } as never);

    await expect(
      service.validateCredentialChecks('presentation-id'),
    ).rejects.toThrow('Credential has been revoked');
  });

  const mockPrismaService = {
    presentation: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    verificationRequest: {
      update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    walletCredential: {
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const mockRedisService = {
    getJson: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    delete: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  const mockEncryptionService = {
    decrypt: jest.fn<(...args: unknown[]) => string>(),
  };

  const mockSignatureService = {
    verify: jest.fn<(...args: unknown[]) => boolean>(),
  };

  const mockDidService = {
    resolveDid: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  const mockTrustRegistryService = {
    isTrusted: jest.fn<(...args: unknown[]) => Promise<boolean>>(),
  };

  const mockCredentialSchemasService = {
    findById: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    validateClaims: jest.fn<(...args: unknown[]) => void>(),
  };

  const service = new VerificationService(
    mockPrismaService as unknown as PrismaService,
    mockRedisService as unknown as RedisService,
    mockEncryptionService as unknown as EncryptionService,
    mockSignatureService as unknown as SignatureService,
    mockDidService as unknown as DidService,
    mockTrustRegistryService as unknown as TrustRegistryService,
    mockCredentialSchemasService as unknown as CredentialSchemasService,
  );

  function mockValidContext() {
    mockPrismaService.presentation.findUnique.mockResolvedValue({
      id: 'presentation-id',
      requestId: 'request-id',
      credentialId: 'credential-id',
      holderId: 'holder-id',
      holderDid: 'did:mock:holder:holder-id',
      nonce,
      disclosedClaims: {
        degree: 'BSc',
      },
      holderProof: {
        algorithm: 'Ed25519',
        verificationMethod: 'did:mock:holder:holder-id#key-1',
        signature: 'holder-signature',
      },
      credential: {
        id: 'credential-id',
        issuerDid: 'did:mock:university:issuer-id',
        credentialHash: '',
      },
      request: {
        id: 'request-id',
        holderId: 'holder-id',
        applicationId: 'application-id',
        nonceHash,
        status: VerificationRequestStatus.APPROVED,
        expiresAt: futureDate,
        application: {
          id: 'application-id',
          holderId: 'holder-id',
        },
      },
    });

    mockRedisService.getJson.mockResolvedValue({
      applicationId: 'application-id',
      holderId: 'holder-id',
      bankId: 'bank-id',
      nonce,
      requestedClaims: ['degree'],
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should validate an approved verification request context', async () => {
    mockValidContext();

    const result = await service.validateRequestContext('presentation-id');

    expect(result.checks).toEqual({
      requestValid: true,
      nonceValid: true,
      holderMatches: true,
    });
  });

  it('should reject a missing presentation', async () => {
    mockPrismaService.presentation.findUnique.mockResolvedValue(null);

    await expect(
      service.validateRequestContext('missing-presentation'),
    ).rejects.toThrow('Presentation not found');
  });

  it('should reject an already consumed request', async () => {
    mockValidContext();

    const presentation = (await mockPrismaService.presentation.findUnique.mock
      .results[0]?.value) as never;

    void presentation;

    mockPrismaService.presentation.findUnique.mockResolvedValue({
      id: 'presentation-id',
      holderId: 'holder-id',
      nonce,
      credential: {
        id: 'credential-id',
      },
      request: {
        id: 'request-id',
        holderId: 'holder-id',
        applicationId: 'application-id',
        nonceHash,
        status: VerificationRequestStatus.VERIFIED,
        expiresAt: futureDate,
        application: {
          holderId: 'holder-id',
        },
      },
    });

    await expect(
      service.validateRequestContext('presentation-id'),
    ).rejects.toThrow('Verification request has already been consumed');
  });

  it('should reject a nonce mismatch', async () => {
    mockValidContext();

    mockRedisService.getJson.mockResolvedValue({
      applicationId: 'application-id',
      holderId: 'holder-id',
      bankId: 'bank-id',
      nonce: 'wrong-nonce',
      requestedClaims: ['degree'],
    });

    await expect(
      service.validateRequestContext('presentation-id'),
    ).rejects.toThrow('Presentation nonce does not match verification request');
  });

  it('should perform holder proof, hash, and issuer signature checks', async () => {
    const unsignedCredential = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      credentialSubject: {
        degree: 'BSc',
        id: 'did:mock:holder:holder-id',
      },
      id: 'urn:uuid:credential',
      issuer: {
        id: 'did:mock:university:issuer-id',
      },
    };

    const canonicalCredential = JSON.stringify({
      '@context': unsignedCredential['@context'],
      credentialSubject: {
        degree: 'BSc',
        id: 'did:mock:holder:holder-id',
      },
      id: 'urn:uuid:credential',
      issuer: {
        id: 'did:mock:university:issuer-id',
      },
    });

    const credentialHash = createHash('sha256')
      .update(canonicalCredential)
      .digest('hex');

    mockValidContext();

    mockPrismaService.presentation.findUnique.mockResolvedValue({
      id: 'presentation-id',
      requestId: 'request-id',
      credentialId: 'credential-id',
      holderId: 'holder-id',
      holderDid: 'did:mock:holder:holder-id',
      nonce,
      disclosedClaims: {
        degree: 'BSc',
      },
      holderProof: {
        algorithm: 'Ed25519',
        verificationMethod: 'did:mock:holder:holder-id#key-1',
        signature: 'holder-signature',
      },
      credential: {
        id: 'credential-id',
        issuerDid: 'did:mock:university:issuer-id',
        credentialHash,
      },
      request: {
        id: 'request-id',
        holderId: 'holder-id',
        applicationId: 'application-id',
        nonceHash,
        status: VerificationRequestStatus.APPROVED,
        expiresAt: futureDate,
        application: {
          holderId: 'holder-id',
        },
      },
    });

    mockPrismaService.walletCredential.findFirst.mockResolvedValue({
      ciphertext: 'ciphertext',
      iv: 'iv',
      authTag: 'auth-tag',
    });

    mockEncryptionService.decrypt.mockReturnValue(
      JSON.stringify({
        ...unsignedCredential,
        proof: {
          type: 'Ed25519Signature',
          verificationMethod: 'did:mock:university:issuer-id#key-1',
          proofValue: 'issuer-signature',
        },
      }),
    );

    mockDidService.resolveDid
      .mockResolvedValueOnce({
        id: 'did:mock:holder:holder-id',
        verificationMethod: {
          id: 'did:mock:holder:holder-id#key-1',
          publicKey: 'holder-public-key',
        },
      })
      .mockResolvedValueOnce({
        id: 'did:mock:university:issuer-id',
        verificationMethod: {
          id: 'did:mock:university:issuer-id#key-1',
          publicKey: 'issuer-public-key',
        },
      });

    mockSignatureService.verify
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);

    const result = await service.validateCryptographicChecks('presentation-id');

    expect(result.checks).toEqual({
      requestValid: true,
      nonceValid: true,
      holderMatches: true,
      holderProofValid: true,
      hashValid: true,
      issuerSignatureValid: true,
    });
  });

  it('should reject an invalid holder proof', async () => {
    mockValidContext();

    mockDidService.resolveDid.mockResolvedValue({
      verificationMethod: {
        id: 'did:mock:holder:holder-id#key-1',
        publicKey: 'holder-public-key',
      },
    });

    mockSignatureService.verify.mockReturnValue(false);

    await expect(
      service.validateCryptographicChecks('presentation-id'),
    ).rejects.toThrow('Holder proof is invalid');
  });
});
