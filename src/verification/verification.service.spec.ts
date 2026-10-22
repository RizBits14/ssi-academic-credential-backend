import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { EncryptionService } from '../crypto/encryption.service';
import { SignatureService } from '../crypto/signature.service';
import { DidService } from '../did/did.service';
import {
  CredentialStatus,
  EducationVerificationStatus,
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
        holderId: 'holder-id',
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
          job: {
            bankId: 'bank-id',
          },
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
      encryptionKeyId: 'v1',
    });

    mockEncryptionService.decryptForWallet.mockReturnValue(
      JSON.stringify({
        ...unsignedCredential,
        proof: {
          type: 'Ed25519Signature',
          verificationMethod: 'did:mock:university:issuer-id#key-1',
          proofValue: 'issuer-signature',
        },
      }),
    );

    mockDidService.resolveVerificationMethod
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

    mockCredentialSchemasService.findByIdForOrganization.mockResolvedValue({
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

    expect(
      mockCredentialSchemasService.findByIdForOrganization,
    ).toHaveBeenCalledWith('schema-id', 'university-org-id');
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

  const transactionClient = {
    verificationRequest: {
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
    },
    application: {
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
    },
    verificationResult: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    auditLog: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const mockPrismaService = {
    presentation: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    verificationRequest: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
    },
    verificationResult: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    walletCredential: {
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    $transaction: jest.fn(
      async (
        callback: (transaction: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    ),
  };

  const mockRedisService = {
    getJson: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    delete: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  const mockEncryptionService = {
    decryptForWallet: jest.fn<(...args: unknown[]) => string>(),
  };

  const mockSignatureService = {
    verify: jest.fn<(...args: unknown[]) => boolean>(),
  };

  const mockDidService = {
    resolveVerificationMethod:
      jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  const mockTrustRegistryService = {
    isTrusted: jest.fn<(...args: unknown[]) => Promise<boolean>>(),
  };

  const mockCredentialSchemasService = {
    findByIdForOrganization:
      jest.fn<(...args: unknown[]) => Promise<unknown>>(),
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
          job: {
            bankId: 'bank-id',
          },
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
    jest.restoreAllMocks();
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

  it('should validate request context only for the owning bank', async () => {
    mockValidContext();

    mockPrismaService.presentation.findFirst.mockResolvedValue({
      id: 'presentation-id',
    });

    const result = await service.validateRequestContextForBank(
      'presentation-id',
      'bank-id',
    );

    expect(mockPrismaService.presentation.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'presentation-id',
        request: {
          is: {
            application: {
              is: {
                job: {
                  is: {
                    bankId: 'bank-id',
                  },
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    expect(result.checks.requestValid).toBe(true);
  });

  it('should hide a presentation belonging to another bank', async () => {
    mockPrismaService.presentation.findFirst.mockResolvedValue(null);

    await expect(
      service.validateRequestContextForBank(
        'presentation-id',
        'different-bank-id',
      ),
    ).rejects.toThrow('Presentation not found');
  });

  it('should reject a verification session with a mismatched bank', async () => {
    mockValidContext();

    mockRedisService.getJson.mockResolvedValue({
      applicationId: 'application-id',
      holderId: 'holder-id',
      bankId: 'different-bank-id',
      nonce,
      requestedClaims: ['degree'],
    });

    await expect(
      service.validateRequestContext('presentation-id'),
    ).rejects.toThrow('Verification session bank mismatch');
  });

  it('should expire only a request that is still approved', async () => {
    mockValidContext();

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
        status: VerificationRequestStatus.APPROVED,
        expiresAt: new Date(Date.now() - 60_000),
        application: {
          holderId: 'holder-id',
          job: {
            bankId: 'bank-id',
          },
        },
      },
    });

    mockPrismaService.verificationRequest.updateMany.mockResolvedValue({
      count: 1,
    });
    mockRedisService.delete.mockResolvedValue(undefined);

    await expect(
      service.validateRequestContext('presentation-id'),
    ).rejects.toThrow('Verification request has expired');

    expect(
      mockPrismaService.verificationRequest.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: 'request-id',
        status: VerificationRequestStatus.APPROVED,
        expiresAt: {
          lte: expect.any(Date),
        },
      },
      data: {
        status: VerificationRequestStatus.EXPIRED,
      },
    });
  });

  it('should not let a stale expiry overwrite a consumed request', async () => {
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
        status: VerificationRequestStatus.APPROVED,
        expiresAt: new Date(Date.now() - 60_000),
        application: {
          holderId: 'holder-id',
          job: {
            bankId: 'bank-id',
          },
        },
      },
    });

    mockPrismaService.verificationRequest.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.validateRequestContext('presentation-id'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(mockRedisService.delete).not.toHaveBeenCalled();
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
          job: {
            bankId: 'bank-id',
          },
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
          job: {
            bankId: 'bank-id',
          },
        },
      },
    });

    mockPrismaService.walletCredential.findFirst.mockResolvedValue({
      ciphertext: 'ciphertext',
      iv: 'iv',
      authTag: 'auth-tag',
      encryptionKeyId: 'v1',
    });

    mockEncryptionService.decryptForWallet.mockReturnValue(
      JSON.stringify({
        ...unsignedCredential,
        proof: {
          type: 'Ed25519Signature',
          verificationMethod: 'did:mock:university:issuer-id#key-1',
          proofValue: 'issuer-signature',
        },
      }),
    );

    mockDidService.resolveVerificationMethod
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

    mockDidService.resolveVerificationMethod.mockResolvedValue({
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

  it('should atomically finalize a successful verification', async () => {
    const requestContext = {
      presentation: {
        id: 'presentation-id',
        disclosedClaims: {
          degree: 'BSc',
        },
      },
      request: {
        id: 'request-id',
        applicationId: 'application-id',
      },
    };

    jest
      .spyOn(service, 'validateRequestContextForBank')
      .mockResolvedValueOnce(requestContext as never);

    jest.spyOn(service, 'validateCredentialChecks').mockResolvedValueOnce({
      ...requestContext,
      checks: {},
    } as never);

    mockPrismaService.verificationResult.findUnique.mockResolvedValue(null);

    transactionClient.verificationRequest.updateMany.mockResolvedValue({
      count: 1,
    });
    transactionClient.application.updateMany.mockResolvedValue({
      count: 1,
    });
    transactionClient.verificationResult.create.mockResolvedValue({
      id: 'verification-result-id',
    });
    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });
    mockRedisService.delete.mockResolvedValue(undefined);

    const result = await service.verifyPresentation(
      'presentation-id',
      'bank-id',
      'verifier-id',
    );

    expect(
      transactionClient.verificationRequest.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: 'request-id',
        status: VerificationRequestStatus.APPROVED,
        application: {
          is: {
            job: {
              is: {
                bankId: 'bank-id',
              },
            },
          },
        },
      },
      data: {
        status: VerificationRequestStatus.VERIFIED,
      },
    });

    expect(transactionClient.application.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'application-id',
        educationVerificationStatus: EducationVerificationStatus.PENDING,
        job: {
          is: {
            bankId: 'bank-id',
          },
        },
      },
      data: {
        educationVerificationStatus: EducationVerificationStatus.VERIFIED,
        verifiedAcademicData: {
          degree: 'BSc',
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        verified: true,
        verificationResultId: 'verification-result-id',
      }),
    );

    expect(mockRedisService.delete).toHaveBeenCalledWith(
      'verification-request:request-id',
    );
  });

  it('should reject a concurrent verification finalization', async () => {
    const requestContext = {
      presentation: {
        id: 'presentation-id',
        disclosedClaims: {
          degree: 'BSc',
        },
      },
      request: {
        id: 'request-id',
        applicationId: 'application-id',
      },
    };

    jest
      .spyOn(service, 'validateRequestContextForBank')
      .mockResolvedValueOnce(requestContext as never);

    jest.spyOn(service, 'validateCredentialChecks').mockResolvedValueOnce({
      ...requestContext,
      checks: {},
    } as never);

    mockPrismaService.verificationResult.findUnique.mockResolvedValue(null);
    transactionClient.verificationRequest.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.verifyPresentation('presentation-id', 'bank-id', 'verifier-id'),
    ).rejects.toThrow('Verification request is no longer approved');

    expect(transactionClient.application.updateMany).not.toHaveBeenCalled();
    expect(transactionClient.verificationResult.create).not.toHaveBeenCalled();
    expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
    expect(mockRedisService.delete).not.toHaveBeenCalled();
  });

  it('should reject finalization when the application state changed', async () => {
    const requestContext = {
      presentation: {
        id: 'presentation-id',
        disclosedClaims: {
          degree: 'BSc',
        },
      },
      request: {
        id: 'request-id',
        applicationId: 'application-id',
      },
    };

    jest
      .spyOn(service, 'validateRequestContextForBank')
      .mockResolvedValueOnce(requestContext as never);

    jest.spyOn(service, 'validateCredentialChecks').mockResolvedValueOnce({
      ...requestContext,
      checks: {},
    } as never);

    mockPrismaService.verificationResult.findUnique.mockResolvedValue(null);
    transactionClient.verificationRequest.updateMany.mockResolvedValue({
      count: 1,
    });
    transactionClient.application.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.verifyPresentation('presentation-id', 'bank-id', 'verifier-id'),
    ).rejects.toThrow('Application verification state has changed');

    expect(transactionClient.verificationResult.create).not.toHaveBeenCalled();
    expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
    expect(mockRedisService.delete).not.toHaveBeenCalled();
  });

  it('should atomically persist a failed verification', async () => {
    const requestContext = {
      presentation: {
        id: 'presentation-id',
      },
      request: {
        id: 'request-id',
        applicationId: 'application-id',
      },
    };

    jest
      .spyOn(service, 'validateRequestContextForBank')
      .mockResolvedValueOnce(requestContext as never);

    jest
      .spyOn(service, 'validateCredentialChecks')
      .mockRejectedValueOnce(
        new BadRequestException('Credential has been revoked'),
      );

    mockPrismaService.verificationResult.findUnique.mockResolvedValue(null);
    mockPrismaService.verificationRequest.findUnique.mockResolvedValue({
      status: VerificationRequestStatus.APPROVED,
    });

    transactionClient.verificationRequest.updateMany.mockResolvedValue({
      count: 1,
    });
    transactionClient.application.updateMany.mockResolvedValue({
      count: 1,
    });
    transactionClient.verificationResult.create.mockResolvedValue({
      id: 'failed-result-id',
    });
    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });
    mockRedisService.delete.mockResolvedValue(undefined);

    await expect(
      service.verifyPresentation('presentation-id', 'bank-id', 'verifier-id'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(
      transactionClient.verificationRequest.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: 'request-id',
        status: VerificationRequestStatus.APPROVED,
        application: {
          is: {
            job: {
              is: {
                bankId: 'bank-id',
              },
            },
          },
        },
      },
      data: {
        status: VerificationRequestStatus.FAILED,
      },
    });

    expect(transactionClient.application.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'application-id',
        educationVerificationStatus: EducationVerificationStatus.PENDING,
        job: {
          is: {
            bankId: 'bank-id',
          },
        },
      },
      data: {
        educationVerificationStatus: EducationVerificationStatus.FAILED,
        verifiedAcademicData: expect.anything(),
      },
    });

    expect(transactionClient.verificationResult.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        presentationId: 'presentation-id',
        applicationId: 'application-id',
        finalResult: expect.anything(),
        failureReason: 'Credential has been revoked',
      }),
    });

    expect(mockRedisService.delete).toHaveBeenCalledWith(
      'verification-request:request-id',
    );
  });
});
