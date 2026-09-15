import { describe, expect, it, jest } from '@jest/globals';

import {
  EducationVerificationStatus,
  VerificationRequestStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { VerificationRequestsService } from './verification-requests.service';

describe('VerificationRequestsService', () => {
  const mockPrismaService = {
    application: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    verificationRequest: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const mockRedisService = {
    setJson: jest.fn<(...args: unknown[]) => Promise<void>>(),
  };

  const service = new VerificationRequestsService(
    mockPrismaService as unknown as PrismaService,
    mockRedisService as unknown as RedisService,
  );

  it('should create a verification request', async () => {
    mockPrismaService.application.findUnique.mockResolvedValue({
      id: 'application-id',
      holderId: 'holder-id',
      job: {
        bankId: 'bank-id',
        requiredClaims: ['degree', 'major', 'cgpa'],
      },
    });

    mockPrismaService.verificationRequest.create.mockResolvedValue({
      id: 'request-id',
      status: VerificationRequestStatus.PENDING,
      requestedClaims: ['degree', 'cgpa'],
      expiresAt: new Date(),
    });

    mockRedisService.setJson.mockResolvedValue();

    mockPrismaService.application.update.mockResolvedValue({});

    const result = await service.create({
      applicationId: 'application-id',
      verifierId: 'verifier-id',
      bankId: 'bank-id',
      requestedClaims: ['degree', 'cgpa'],
    });

    expect(result.requestId).toBe('request-id');

    expect(result.nonce).toBeDefined();

    expect(mockRedisService.setJson).toHaveBeenCalledWith(
      'verification-request:request-id',
      expect.objectContaining({
        applicationId: 'application-id',
        holderId: 'holder-id',
        bankId: 'bank-id',
        requestedClaims: ['degree', 'cgpa'],
      }),
      300,
    );

    expect(mockPrismaService.application.update).toHaveBeenCalledWith({
      where: {
        id: 'application-id',
      },
      data: {
        educationVerificationStatus: EducationVerificationStatus.PENDING,
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
});
