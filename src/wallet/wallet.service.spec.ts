import { describe, expect, it, jest } from '@jest/globals';

import { EncryptionService } from '../crypto/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  const mockPrismaService = {
    walletCredential: {
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const mockEncryptionService = {
    decrypt: jest.fn<(...args: unknown[]) => string>(),
  };

  const service = new WalletService(
    mockPrismaService as unknown as PrismaService,
    mockEncryptionService as unknown as EncryptionService,
  );

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

  it('should decrypt a wallet credential belonging to the holder', async () => {
    mockPrismaService.walletCredential.findFirst.mockResolvedValue({
      id: 'wallet-credential-id',
      holderId: 'holder-id',
      credentialId: 'credential-id',
      ciphertext: 'encrypted-data',
      iv: 'test-iv',
      authTag: 'test-auth-tag',
      credential: {
        id: 'credential-id',
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

    const result = await service.decryptCredentialForHolder(
      'holder-id',
      'wallet-credential-id',
    );

    expect(mockPrismaService.walletCredential.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'wallet-credential-id',
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
    });

    expect(mockEncryptionService.decrypt).toHaveBeenCalledWith({
      ciphertext: 'encrypted-data',
      iv: 'test-iv',
      authTag: 'test-auth-tag',
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
});
