import { beforeEach, describe, expect, it, jest } from '@jest/globals';

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
    auditLog: {
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

  let service: CredentialStatusService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new CredentialStatusService(
      mockPrismaService as unknown as PrismaService,
    );
  });

  it('should suspend an active credential with history and audit log', async () => {
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

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
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

    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'issuer-admin-id',
        organizationId: 'university-id',
        action: 'CREDENTIAL_SUSPENDED',
        resourceType: 'Credential',
        resourceId: 'credential-id',
        metadata: {
          previousStatus: CredentialStatus.ACTIVE,
          newStatus: CredentialStatus.SUSPENDED,
          reason: 'Under investigation',
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: CredentialStatus.SUSPENDED,
      }),
    );
  });

  it('should revoke a credential with history and audit log', async () => {
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

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.revoke({
      credentialId: 'credential-id',
      issuerOrganizationId: 'university-id',
      changedBy: 'issuer-admin-id',
      reason: 'Incorrect academic record',
    });

    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'issuer-admin-id',
        organizationId: 'university-id',
        action: 'CREDENTIAL_REVOKED',
        resourceType: 'Credential',
        resourceId: 'credential-id',
        metadata: {
          previousStatus: CredentialStatus.ACTIVE,
          newStatus: CredentialStatus.REVOKED,
          reason: 'Incorrect academic record',
        },
      },
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

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.reactivate({
      credentialId: 'credential-id',
      issuerOrganizationId: 'university-id',
      changedBy: 'issuer-admin-id',
    });

    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'issuer-admin-id',
        organizationId: 'university-id',
        action: 'CREDENTIAL_REACTIVATED',
        resourceType: 'Credential',
        resourceId: 'credential-id',
        metadata: {
          previousStatus: CredentialStatus.SUSPENDED,
          newStatus: CredentialStatus.ACTIVE,
        },
      },
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

  it('should reject revoking an expired credential', async () => {
    mockPrismaService.credential.findFirst.mockResolvedValue({
      id: 'credential-id',
      issuerOrganizationId: 'university-id',
      status: CredentialStatus.EXPIRED,
    });

    await expect(
      service.revoke({
        credentialId: 'credential-id',
        issuerOrganizationId: 'university-id',
        changedBy: 'issuer-admin-id',
      }),
    ).rejects.toThrow('An expired credential cannot be revoked');
  });
});
