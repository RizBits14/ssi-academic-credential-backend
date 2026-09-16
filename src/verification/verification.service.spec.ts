import { createHash } from 'node:crypto';

import { describe, expect, it, jest } from '@jest/globals';

import { VerificationRequestStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { VerificationService } from './verification.service';

describe('VerificationService', () => {
  const futureDate = new Date(Date.now() + 60_000);

  const mockPrismaService = {
    presentation: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    verificationRequest: {
      update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const mockRedisService = {
    getJson: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    delete: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  const service = new VerificationService(
    mockPrismaService as unknown as PrismaService,
    mockRedisService as unknown as RedisService,
  );

  it('should validate an approved verification request context', async () => {
    const nonce = 'test-nonce';

    const nonceHash = createHash('sha256').update(nonce).digest('hex');

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
      requestedClaims: ['degree', 'major'],
    });

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
    mockPrismaService.presentation.findUnique.mockResolvedValue({
      id: 'presentation-id',
      holderId: 'holder-id',
      nonce: 'nonce',
      credential: {
        id: 'credential-id',
      },
      request: {
        id: 'request-id',
        holderId: 'holder-id',
        applicationId: 'application-id',
        nonceHash: 'hash',
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
    mockPrismaService.presentation.findUnique.mockResolvedValue({
      id: 'presentation-id',
      holderId: 'holder-id',
      nonce: 'presentation-nonce',
      credential: {
        id: 'credential-id',
      },
      request: {
        id: 'request-id',
        holderId: 'holder-id',
        applicationId: 'application-id',
        nonceHash: 'wrong-hash',
        status: VerificationRequestStatus.APPROVED,
        expiresAt: futureDate,
        application: {
          holderId: 'holder-id',
        },
      },
    });

    mockRedisService.getJson.mockResolvedValue({
      applicationId: 'application-id',
      holderId: 'holder-id',
      bankId: 'bank-id',
      nonce: 'different-nonce',
      requestedClaims: ['degree'],
    });

    await expect(
      service.validateRequestContext('presentation-id'),
    ).rejects.toThrow('Presentation nonce does not match verification request');
  });
});
