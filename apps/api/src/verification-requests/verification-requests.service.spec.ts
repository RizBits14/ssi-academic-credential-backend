import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createHash } from 'node:crypto';

import { canonicalizeJson } from '../common/utils/json-canonicalization.util';
import {
  DidOwnerType,
  EducationVerificationStatus,
  VerificationRequestStatus,
} from '../generated/prisma/enums';
import { VerificationRequestsService } from './verification-requests.service';

describe('VerificationRequestsService', () => {
  const validHolderSignatureBase64 =
    'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ==';

  const validHolderProofValue =
    'z2AXDGYSE4f2sz7tvMMzyHvUfcoJmxudvdhBcmiUSo6ijwfYmfZYsKRxboQMPh3R4kUhXRVdtSXFXMheka4Rc4P2';

  const transactionClient = {
    verificationRequest: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),

      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
    },

    application: {
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
    },

    presentation: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    auditLog: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const mockPrismaService = {
    application: {
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    verificationRequest: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),

      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),

      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
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
    setJson: jest.fn<(...args: unknown[]) => Promise<void>>(),

    getJson: jest.fn<(...args: unknown[]) => Promise<unknown>>(),

    delete: jest.fn<(...args: unknown[]) => Promise<void>>(),
  };

  const mockEncryptionService = {
    decryptForWallet: jest.fn<(...args: unknown[]) => string>(),
  };

  const mockDidService = {
    findPublicByOwner: jest.fn<(...args: unknown[]) => Promise<unknown>>(),

    signForUser: jest.fn<
      (...args: unknown[]) => Promise<{
        did: string;
        keyVersion: number;
        signature: string;
      }>
    >(),
  };

  let service: VerificationRequestsService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new VerificationRequestsService(
      mockPrismaService as never,
      mockRedisService as never,
      mockEncryptionService as never,
      mockDidService as never,
    );
  });

  it('should find a verification request only for its holder', async () => {
    mockPrismaService.verificationRequest.findFirst.mockResolvedValue({
      id: 'request-id',
      holderId: 'holder-id',
    });

    const result = await service.findOneForHolder('request-id', 'holder-id');

    expect(
      mockPrismaService.verificationRequest.findFirst,
    ).toHaveBeenCalledWith({
      where: {
        id: 'request-id',
        holderId: 'holder-id',
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

    expect(result).toEqual(
      expect.objectContaining({
        id: 'request-id',
      }),
    );
  });

  it('should reject holder access to another holders verification request', async () => {
    mockPrismaService.verificationRequest.findFirst.mockResolvedValue(null);

    await expect(
      service.findOneForHolder('request-id', 'different-holder-id'),
    ).rejects.toThrow('Verification request not found');
  });

  it('should find a verification request only for the owning bank', async () => {
    mockPrismaService.verificationRequest.findFirst.mockResolvedValue({
      id: 'request-id',
      holderId: 'holder-id',
    });

    const result = await service.findOneForBank('request-id', 'bank-id');

    expect(
      mockPrismaService.verificationRequest.findFirst,
    ).toHaveBeenCalledWith({
      where: {
        id: 'request-id',
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

    expect(result).toEqual(
      expect.objectContaining({
        id: 'request-id',
      }),
    );
  });

  it('should reject bank access to another banks verification request', async () => {
    mockPrismaService.verificationRequest.findFirst.mockResolvedValue(null);

    await expect(
      service.findOneForBank('request-id', 'different-bank-id'),
    ).rejects.toThrow('Verification request not found');
  });

  it('should create a request for an application owned by the bank', async () => {
    mockPrismaService.application.findFirst.mockResolvedValue({
      id: 'application-id',
      holderId: 'holder-id',
      job: {
        bankId: 'bank-id',
        requiredClaims: ['degree', 'major', 'cgpa'],
      },
    });

    mockRedisService.setJson.mockResolvedValue();
    mockRedisService.delete.mockResolvedValue();

    transactionClient.application.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionClient.verificationRequest.create.mockImplementation(
      (...args: unknown[]) => {
        const [input] = args as [
          {
            data: {
              id: string;
              requestedClaims: string[];
              expiresAt: Date;
            };
          },
        ];

        return Promise.resolve({
          id: input.data.id,
          requestedClaims: input.data.requestedClaims,
          expiresAt: input.data.expiresAt,
          status: VerificationRequestStatus.PENDING,
        });
      },
    );

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.create({
      applicationId: 'application-id',
      verifierId: 'verifier-id',
      bankId: 'bank-id',
      requestedClaims: ['degree', 'cgpa'],
    });

    expect(mockPrismaService.application.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'application-id',
        job: {
          is: {
            bankId: 'bank-id',
          },
        },
      },
      include: {
        job: true,
      },
    });

    expect(transactionClient.application.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'application-id',
        job: {
          is: {
            bankId: 'bank-id',
          },
        },
      },
      data: {
        educationVerificationStatus: EducationVerificationStatus.PENDING,
      },
    });

    expect(result.requestId).toBeDefined();
    expect(result.nonce).toBeDefined();

    expect(mockRedisService.setJson).toHaveBeenCalledWith(
      expect.stringMatching(/^verification-request:/),
      expect.objectContaining({
        applicationId: 'application-id',
        holderId: 'holder-id',
        bankId: 'bank-id',
        requestedClaims: ['degree', 'cgpa'],
      }),
      300,
    );

    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'verifier-id',
        organizationId: 'bank-id',
        action: 'CREDENTIAL_REQUEST_CREATED',
        resourceType: 'VerificationRequest',
        resourceId: result.requestId,
        metadata: {
          applicationId: 'application-id',
          holderId: 'holder-id',
          requestedClaims: ['degree', 'cgpa'],
        },
      },
    });
  });

  it('should reject an application belonging to another bank without revealing it', async () => {
    mockPrismaService.application.findFirst.mockResolvedValue(null);

    await expect(
      service.create({
        applicationId: 'application-id',
        verifierId: 'verifier-id',
        bankId: 'bank-id',
        requestedClaims: ['degree'],
      }),
    ).rejects.toThrow('Application not found');

    expect(mockRedisService.setJson).not.toHaveBeenCalled();
  });

  it('should reject claims not required by the job', async () => {
    mockPrismaService.application.findFirst.mockResolvedValue({
      id: 'application-id',
      holderId: 'holder-id',
      job: {
        bankId: 'bank-id',
        requiredClaims: ['degree', 'major'],
      },
    });

    await expect(
      service.create({
        applicationId: 'application-id',
        verifierId: 'verifier-id',
        bankId: 'bank-id',
        requestedClaims: ['degree', 'studentId'],
      }),
    ).rejects.toThrow(
      'Requested claims must be part of the job required claims',
    );
  });

  it('should approve a request with an atomic pending transition', async () => {
    mockPrismaService.verificationRequest.findFirst.mockResolvedValue({
      id: 'request-id',
      applicationId: 'application-id',
      holderId: 'holder-id',
      requestedClaims: ['degree', 'cgpa'],
      status: VerificationRequestStatus.PENDING,
      expiresAt: new Date(Date.now() + 60_000),
    });

    mockRedisService.getJson.mockResolvedValue({
      applicationId: 'application-id',
      holderId: 'holder-id',
      bankId: 'bank-id',
      nonce: 'test-nonce',
      requestedClaims: ['degree', 'cgpa'],
    });

    mockPrismaService.walletCredential.findFirst.mockResolvedValue({
      id: 'wallet-id',
      holderId: 'holder-id',
      credentialId: 'credential-id',
      ciphertext: 'encrypted',
      iv: 'iv',
      authTag: 'tag',
      encryptionKeyId: 'v1',
      credential: {
        id: 'credential-id',
      },
    });

    mockEncryptionService.decryptForWallet.mockReturnValue(
      JSON.stringify({
        issuer: {
          name: 'Example University',
        },
        credentialSubject: {
          degree: 'Bachelor of Science',
          cgpa: 3.75,
        },
      }),
    );

    mockDidService.findPublicByOwner.mockResolvedValue({
      id: 'holder-did-record-id',
      did: 'did:mock:holder:123',
      ownerType: DidOwnerType.USER,
      ownerId: 'holder-id',
      currentKeyVersion: 1,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDidService.signForUser.mockResolvedValue({
      did: 'did:mock:holder:123',
      keyVersion: 1,
      signature: validHolderSignatureBase64,
    });

    transactionClient.verificationRequest.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionClient.presentation.create.mockImplementation(
      (...args: unknown[]) => {
        const [input] = args as [
          {
            data: {
              id: string;
            };
          },
        ];

        return Promise.resolve({
          id: input.data.id,
        });
      },
    );

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.approve({
      requestId: 'request-id',
      holderId: 'holder-id',
      credentialId: 'credential-id',
      approvedClaims: ['degree', 'cgpa'],
    });

    expect(
      transactionClient.verificationRequest.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: 'request-id',
        holderId: 'holder-id',
        status: VerificationRequestStatus.PENDING,
        expiresAt: {
          gt: expect.any(Date),
        },
      },
      data: {
        status: VerificationRequestStatus.APPROVED,
      },
    });

    expect(result.presentationId).toBeDefined();

    expect(mockDidService.findPublicByOwner).toHaveBeenCalledWith(
      DidOwnerType.USER,
      'holder-id',
    );

    const presentationCreateCall = transactionClient.presentation.create.mock
      .calls[0]?.[0] as {
      data: {
        id: string;
        requestId: string;
        credentialId: string;
        holderId: string;
        holderDid: string;
        disclosedClaims: Record<string, unknown>;
        nonce: string;
        presentationHash: string;
        holderProof: Record<string, unknown>;
      };
    };

    const createdAt = presentationCreateCall.data.holderProof.created;

    expect(typeof createdAt).toBe('string');

    const unsecuredPresentation = {
      presentationId: result.presentationId,
      requestId: 'request-id',
      credentialId: 'credential-id',
      holderDid: 'did:mock:holder:123',
      disclosedClaims: {
        degree: 'Bachelor of Science',
        cgpa: 3.75,
      },
    };

    const canonicalPresentation = canonicalizeJson(unsecuredPresentation);

    const expectedPresentationHash = createHash('sha256')
      .update(canonicalPresentation, 'utf8')
      .digest('hex');

    const proofOptions = {
      type: 'DataIntegrityProof',
      cryptosuite: 'eddsa-jcs-2022',
      created: createdAt,
      verificationMethod: 'did:mock:holder:123#key-1',
      proofPurpose: 'authentication',
      challenge: 'test-nonce',
      domain: 'bank-id',
    };

    const proofConfigHash = createHash('sha256')
      .update(canonicalizeJson(proofOptions), 'utf8')
      .digest();

    const transformedDocumentHash = createHash('sha256')
      .update(canonicalPresentation, 'utf8')
      .digest();

    const expectedSigningPayload = Buffer.concat([
      proofConfigHash,
      transformedDocumentHash,
    ]);

    expect(expectedSigningPayload).toHaveLength(64);

    expect(mockDidService.signForUser).toHaveBeenCalledWith(
      'holder-id',
      expectedSigningPayload,
    );

    expect(transactionClient.presentation.create).toHaveBeenCalledWith({
      data: {
        id: result.presentationId,
        requestId: 'request-id',
        credentialId: 'credential-id',
        holderId: 'holder-id',
        holderDid: 'did:mock:holder:123',
        disclosedClaims: {
          degree: 'Bachelor of Science',
          cgpa: 3.75,
        },
        nonce: 'test-nonce',
        presentationHash: expectedPresentationHash,
        holderProof: {
          ...proofOptions,
          proofValue: validHolderProofValue,
        },
      },
    });

    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'holder-id',
        organizationId: 'bank-id',
        action: 'CREDENTIAL_REQUEST_APPROVED',
        resourceType: 'VerificationRequest',
        resourceId: 'request-id',
        metadata: {
          applicationId: 'application-id',
          credentialId: 'credential-id',
          approvedClaims: ['degree', 'cgpa'],
        },
      },
    });

    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'holder-id',
        organizationId: 'bank-id',
        action: 'PRESENTATION_CREATED',
        resourceType: 'Presentation',
        resourceId: result.presentationId,
        metadata: {
          requestId: 'request-id',
          applicationId: 'application-id',
          credentialId: 'credential-id',
          disclosedClaimNames: ['degree', 'cgpa'],
        },
      },
    });
  });

  it('should reject a request with an atomic pending transition', async () => {
    mockPrismaService.verificationRequest.findFirst.mockResolvedValue({
      id: 'request-id',
      applicationId: 'application-id',
      holderId: 'holder-id',
      status: VerificationRequestStatus.PENDING,
      expiresAt: new Date(Date.now() + 60_000),
    });

    mockRedisService.getJson.mockResolvedValue({
      applicationId: 'application-id',
      holderId: 'holder-id',
      bankId: 'bank-id',
      nonce: 'nonce',
      requestedClaims: ['degree'],
    });

    transactionClient.verificationRequest.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    mockRedisService.delete.mockResolvedValue();

    const result = await service.reject('request-id', 'holder-id');

    expect(
      transactionClient.verificationRequest.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: 'request-id',
        holderId: 'holder-id',
        status: VerificationRequestStatus.PENDING,
        expiresAt: {
          gt: expect.any(Date),
        },
      },
      data: {
        status: VerificationRequestStatus.REJECTED,
      },
    });

    expect(result).toEqual({
      requestId: 'request-id',
      status: VerificationRequestStatus.REJECTED,
    });

    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'holder-id',
        organizationId: 'bank-id',
        action: 'CREDENTIAL_REQUEST_REJECTED',
        resourceType: 'VerificationRequest',
        resourceId: 'request-id',
        metadata: {
          applicationId: 'application-id',
        },
      },
    });

    expect(mockRedisService.delete).toHaveBeenCalledWith(
      'verification-request:request-id',
    );
  });

  it('should reject a concurrent state transition when another request already changed the status', async () => {
    mockPrismaService.verificationRequest.findFirst.mockResolvedValue({
      id: 'request-id',
      applicationId: 'application-id',
      holderId: 'holder-id',
      status: VerificationRequestStatus.PENDING,
      expiresAt: new Date(Date.now() + 60_000),
    });

    mockRedisService.getJson.mockResolvedValue({
      applicationId: 'application-id',
      holderId: 'holder-id',
      bankId: 'bank-id',
      nonce: 'nonce',
      requestedClaims: ['degree'],
    });

    transactionClient.verificationRequest.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(service.reject('request-id', 'holder-id')).rejects.toThrow(
      'Verification request is no longer pending or has expired',
    );

    expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
  });

  it('should expire only a request that is still pending', async () => {
    mockPrismaService.verificationRequest.findFirst.mockResolvedValue({
      id: 'request-id',
      applicationId: 'application-id',
      holderId: 'holder-id',
      requestedClaims: ['degree'],
      status: VerificationRequestStatus.PENDING,
      expiresAt: new Date(Date.now() - 60_000),
    });

    mockPrismaService.verificationRequest.updateMany.mockResolvedValue({
      count: 1,
    });

    mockRedisService.delete.mockResolvedValue();

    await expect(
      service.approve({
        requestId: 'request-id',
        holderId: 'holder-id',
        credentialId: 'credential-id',
        approvedClaims: ['degree'],
      }),
    ).rejects.toThrow('Verification request has expired');

    expect(
      mockPrismaService.verificationRequest.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: 'request-id',
        status: VerificationRequestStatus.PENDING,
      },
      data: {
        status: VerificationRequestStatus.EXPIRED,
      },
    });

    expect(mockRedisService.delete).toHaveBeenCalledWith(
      'verification-request:request-id',
    );
  });
});
