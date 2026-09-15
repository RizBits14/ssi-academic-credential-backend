import { describe, expect, it, jest } from '@jest/globals';

import { CredentialStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialStatusService } from './credential-status.service';

describe('CredentialStatusService', () => {
  const transactionClient = {
    credential: {
      update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    credentialStatusHistory: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const mockPrismaService = {
    credential: {
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    credentialStatusHistory: {
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    $transaction: jest.fn(
      async (
        callback: (transaction: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    ),
  };

  const service = new CredentialStatusService(
    mockPrismaService as unknown as PrismaService,
  );

  it('should suspend an active credential and create history', async () => {
    mockPrismaService.credential.findFirst.mockResolvedValue({
      id: 'credential-id',
      issuerOrganizationId: 'university-id',
      status: CredentialStatus.ACTIVE,
    });

    transactionClient.credential.update.mockResolvedValue({
      id: 'credential-id',
      status: CredentialStatus.SUSPENDED,
    });

    transactionClient.credentialStatusHistory.create.mockResolvedValue({
      id: 'history-id',
    });

    const result = await service.suspend({
      credentialId: 'credential-id',
      issuerOrganizationId: 'university-id',
      changedBy: 'issuer-admin-id',
      reason: 'Under investigation',
    });

    expect(transactionClient.credential.update).toHaveBeenCalledWith({
      where: {
        id: 'credential-id',
      },
      data: {
        status: CredentialStatus.SUSPENDED,
      },
    });

    expect(
      transactionClient.credentialStatusHistory.create,
    ).toHaveBeenCalledWith({
      data: {
        credentialId: 'credential-id',
        previousStatus: CredentialStatus.ACTIVE,
        newStatus: CredentialStatus.SUSPENDED,
        changedBy: 'issuer-admin-id',
        reason: 'Under investigation',
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: CredentialStatus.SUSPENDED,
      }),
    );
  });

  it('should revoke an active credential', async () => {
    mockPrismaService.credential.findFirst.mockResolvedValue({
      id: 'credential-id',
      issuerOrganizationId: 'university-id',
      status: CredentialStatus.ACTIVE,
    });

    transactionClient.credential.update.mockResolvedValue({
      id: 'credential-id',
      status: CredentialStatus.REVOKED,
    });

    transactionClient.credentialStatusHistory.create.mockResolvedValue({
      id: 'history-id',
    });

    const result = await service.revoke({
      credentialId: 'credential-id',
      issuerOrganizationId: 'university-id',
      changedBy: 'issuer-admin-id',
      reason: 'Incorrect academic record',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: CredentialStatus.REVOKED,
      }),
    );
  });

  it('should reactivate only a suspended credential', async () => {
    mockPrismaService.credential.findFirst.mockResolvedValue({
      id: 'credential-id',
      issuerOrganizationId: 'university-id',
      status: CredentialStatus.SUSPENDED,
    });

    transactionClient.credential.update.mockResolvedValue({
      id: 'credential-id',
      status: CredentialStatus.ACTIVE,
    });

    transactionClient.credentialStatusHistory.create.mockResolvedValue({
      id: 'history-id',
    });

    const result = await service.reactivate({
      credentialId: 'credential-id',
      issuerOrganizationId: 'university-id',
      changedBy: 'issuer-admin-id',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: CredentialStatus.ACTIVE,
      }),
    );
  });

  it('should reject reactivation of a revoked credential', async () => {
    mockPrismaService.credential.findFirst.mockResolvedValue({
      id: 'credential-id',
      issuerOrganizationId: 'university-id',
      status: CredentialStatus.REVOKED,
    });

    await expect(
      service.reactivate({
        credentialId: 'credential-id',
        issuerOrganizationId: 'university-id',
        changedBy: 'issuer-admin-id',
      }),
    ).rejects.toThrow('Only a suspended credential can be reactivated');
  });
});
