import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { EncryptionService } from '../crypto/encryption.service';
import { DidService } from '../did/did.service';
import {
  EducationVerificationStatus,
  VerificationRequestStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { VerificationRequestsService } from './verification-requests.service';

describe('VerificationRequestsService', () => {
  const transactionClient = {
    verificationRequest: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),

      update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    application: {
      update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
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
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    verificationRequest: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),

      update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
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
    decrypt: jest.fn<(...args: unknown[]) => string>(),
  };

  const mockDidService = {
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
      mockPrismaService as unknown as PrismaService,
      mockRedisService as unknown as RedisService,
      mockEncryptionService as unknown as EncryptionService,
      mockDidService as unknown as DidService,
    );
  });

  it('should return a verification request by id', async () => {
    mockPrismaService.verificationRequest.findUnique.mockResolvedValue({
      id: 'request-id',
      holderId: 'holder-id',
      status: VerificationRequestStatus.PENDING,
      application: {
        job: {
          bankId: 'bank-id',
        },
      },
    });

    const result = await service.findOne('request-id');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'request-id',
      }),
    );
  });

  it('should create a request, update application and write audit log', async () => {
    mockPrismaService.application.findUnique.mockResolvedValue({
      id: 'application-id',
      holderId: 'holder-id',
      job: {
        bankId: 'bank-id',
        requiredClaims: ['degree', 'major', 'cgpa'],
      },
    });

    mockRedisService.setJson.mockResolvedValue();

    mockRedisService.delete.mockResolvedValue();

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

    transactionClient.application.update.mockResolvedValue({});

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.create({
      applicationId: 'application-id',
      verifierId: 'verifier-id',
      bankId: 'bank-id',
      requestedClaims: ['degree', 'cgpa'],
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

    expect(transactionClient.application.update).toHaveBeenCalledWith({
      where: {
        id: 'application-id',
      },
      data: {
        educationVerificationStatus: EducationVerificationStatus.PENDING,
      },
    });

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

  it('should reject an application belonging to another bank', async () => {
    mockPrismaService.application.findUnique.mockResolvedValue({
      id: 'application-id',
      holderId: 'holder-id',
      job: {
        bankId: 'different-bank',
        requiredClaims: ['degree'],
      },
    });

    await expect(
      service.create({
        applicationId: 'application-id',
        verifierId: 'verifier-id',
        bankId: 'bank-id',
        requestedClaims: ['degree'],
      }),
    ).rejects.toThrow('Application does not belong to your bank');
  });

  it('should reject claims not required by the job', async () => {
    mockPrismaService.application.findUnique.mockResolvedValue({
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

  it('should approve a request and audit approval and presentation creation', async () => {
    mockPrismaService.verificationRequest.findUnique.mockResolvedValue({
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
      credential: {
        id: 'credential-id',
      },
    });

    mockEncryptionService.decrypt.mockReturnValue(
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

    mockDidService.signForUser.mockResolvedValue({
      did: 'did:mock:holder:123',
      keyVersion: 1,
      signature: 'signature',
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

    transactionClient.verificationRequest.update.mockResolvedValue({
      id: 'request-id',
      status: VerificationRequestStatus.APPROVED,
    });

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.approve({
      requestId: 'request-id',
      holderId: 'holder-id',
      credentialId: 'credential-id',
      approvedClaims: ['degree', 'cgpa'],
    });

    expect(result.presentationId).toBeDefined();

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

  it('should reject a request and create an audit log', async () => {
    mockPrismaService.verificationRequest.findUnique.mockResolvedValue({
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

    transactionClient.verificationRequest.update.mockResolvedValue({
      id: 'request-id',
      status: VerificationRequestStatus.REJECTED,
    });

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    mockRedisService.delete.mockResolvedValue();

    const result = await service.reject('request-id', 'holder-id');

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
});
