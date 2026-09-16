import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { EncryptionService } from '../crypto/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  const mockPrismaService = {
    walletCredential: {
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),

      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    verificationRequest: {
      updateMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),

      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    auditLog: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const mockEncryptionService = {
    decrypt: jest.fn<(...args: unknown[]) => string>(),
  };

  let service: WalletService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new WalletService(
      mockPrismaService as unknown as PrismaService,
      mockEncryptionService as unknown as EncryptionService,
    );
  });

  it('should list wallet credentials belonging to a holder', async () => {
    mockPrismaService.walletCredential.findMany.mockResolvedValue([
      {
        id: 'wallet-credential-id',
        holderId: 'holder-id',
        credentialId: 'credential-id',
      },
    ]);

    const result = await service.findByHolder('holder-id');

    expect(mockPrismaService.walletCredential.findMany).toHaveBeenCalledWith({
      where: {
        holderId: 'holder-id',
      },
      include: {
        credential: {
          include: {
            issuerOrganization: true,
            schema: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(result).toHaveLength(1);
  });

  it('should decrypt and audit a credential view', async () => {
    mockPrismaService.walletCredential.findFirst.mockResolvedValue({
      id: 'wallet-credential-id',
      holderId: 'holder-id',
      credentialId: 'credential-id',
      ciphertext: 'encrypted-data',
      iv: 'test-iv',
      authTag: 'test-auth-tag',

      credential: {
        id: 'credential-id',
        issuerOrganizationId: 'university-id',
        issuerOrganization: {
          id: 'university-id',
          name: 'Example University',
        },
        schema: {
          id: 'schema-id',
        },
      },
    });

    mockEncryptionService.decrypt.mockReturnValue(
      JSON.stringify({
        id: 'urn:uuid:test',

        credentialSubject: {
          studentId: '20260001',
        },
      }),
    );

    mockPrismaService.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.decryptCredentialForHolder(
      'holder-id',
      'wallet-credential-id',
    );

    expect(mockEncryptionService.decrypt).toHaveBeenCalledWith({
      ciphertext: 'encrypted-data',
      iv: 'test-iv',
      authTag: 'test-auth-tag',
    });

    expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'holder-id',
        organizationId: 'university-id',
        action: 'CREDENTIAL_VIEWED',
        resourceType: 'Credential',
        resourceId: 'credential-id',

        metadata: {
          walletCredentialId: 'wallet-credential-id',
        },
      },
    });

    expect(result).toEqual({
      id: 'urn:uuid:test',

      credentialSubject: {
        studentId: '20260001',
      },
    });
  });

  it('should reject access to a wallet credential not owned by the holder', async () => {
    mockPrismaService.walletCredential.findFirst.mockResolvedValue(null);

    await expect(
      service.findOneForHolder('different-holder-id', 'wallet-credential-id'),
    ).rejects.toThrow('Wallet credential not found');
  });

  it('should return pending verification requests for the holder', async () => {
    const expiresAt = new Date('2030-01-01T00:00:00.000Z');

    mockPrismaService.verificationRequest.updateMany.mockResolvedValue({
      count: 0,
    });

    mockPrismaService.verificationRequest.findMany.mockResolvedValue([
      {
        id: 'request-id',
        requestedClaims: ['degree', 'major'],
        expiresAt,

        application: {
          job: {
            title: 'Graduate Engineer',

            bank: {
              name: 'Example Bank',
            },
          },
        },
      },
    ]);

    const result = await service.findPendingRequests('holder-id');

    expect(
      mockPrismaService.verificationRequest.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          holderId: 'holder-id',
        }),
      }),
    );

    expect(mockPrismaService.verificationRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          holderId: 'holder-id',
        }),
      }),
    );

    expect(result).toEqual([
      {
        requestId: 'request-id',
        bank: 'Example Bank',
        job: 'Graduate Engineer',
        requestedClaims: ['degree', 'major'],
        expiresAt,
      },
    ]);
  });
});
