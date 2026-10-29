import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { CredentialStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialStatusService } from './credential-status.service';

describe('CredentialStatusService', () => {
  const transactionClient = {
    credential: {
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
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

    transactionClient.credential.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionClient.credential.findFirst.mockResolvedValue({
      id: 'credential-id',
      issuerOrganizationId: 'university-id',
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

    expect(transactionClient.credential.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'credential-id',
        issuerOrganizationId: 'university-id',
        status: CredentialStatus.ACTIVE,
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

    transactionClient.credential.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionClient.credential.findFirst.mockResolvedValue({
      id: 'credential-id',
      issuerOrganizationId: 'university-id',
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

    expect(transactionClient.credential.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'credential-id',
        issuerOrganizationId: 'university-id',
        status: CredentialStatus.ACTIVE,
      },
      data: {
        status: CredentialStatus.REVOKED,
      },
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

    transactionClient.credential.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionClient.credential.findFirst.mockResolvedValue({
      id: 'credential-id',
      issuerOrganizationId: 'university-id',
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

    expect(transactionClient.credential.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'credential-id',
        issuerOrganizationId: 'university-id',
        status: CredentialStatus.SUSPENDED,
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      data: {
        status: CredentialStatus.ACTIVE,
      },
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

  it('should reject reactivation of an expired suspended credential', async () => {
    mockPrismaService.credential.findFirst.mockResolvedValue({
      id: 'credential-id',
      issuerOrganizationId: 'university-id',
      status: CredentialStatus.SUSPENDED,
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    await expect(
      service.reactivate({
        credentialId: 'credential-id',
        issuerOrganizationId: 'university-id',
        changedBy: 'issuer-admin-id',
      }),
    ).rejects.toThrow('An expired credential cannot be reactivated');

    expect(transactionClient.credential.updateMany).not.toHaveBeenCalled();

    expect(
      transactionClient.credentialStatusHistory.create,
    ).not.toHaveBeenCalled();

    expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
  });

  it('should reactivate an unexpired suspended credential', async () => {
    const expiresAt = new Date('2099-01-01T00:00:00.000Z');

    mockPrismaService.credential.findFirst.mockResolvedValue({
      id: 'credential-id',
      issuerOrganizationId: 'university-id',
      status: CredentialStatus.SUSPENDED,
      expiresAt,
    });

    transactionClient.credential.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionClient.credential.findFirst.mockResolvedValue({
      id: 'credential-id',
      issuerOrganizationId: 'university-id',
      status: CredentialStatus.ACTIVE,
      expiresAt,
    });

    transactionClient.credentialStatusHistory.create.mockResolvedValue({
      id: 'history-id',
    });

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    await expect(
      service.reactivate({
        credentialId: 'credential-id',
        issuerOrganizationId: 'university-id',
        changedBy: 'issuer-admin-id',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: CredentialStatus.ACTIVE,
      }),
    );

    expect(transactionClient.credential.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'credential-id',
        issuerOrganizationId: 'university-id',
        status: CredentialStatus.SUSPENDED,
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      data: {
        status: CredentialStatus.ACTIVE,
      },
    });
  });

  it('should reject reactivation when the atomic update cannot complete', async () => {
    mockPrismaService.credential.findFirst.mockResolvedValue({
      id: 'credential-id',
      issuerOrganizationId: 'university-id',
      status: CredentialStatus.SUSPENDED,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    transactionClient.credential.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.reactivate({
        credentialId: 'credential-id',
        issuerOrganizationId: 'university-id',
        changedBy: 'issuer-admin-id',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      transactionClient.credentialStatusHistory.create,
    ).not.toHaveBeenCalled();

    expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
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

  it('should scope credential status lookup to the issuer organization', async () => {
    mockPrismaService.credential.findFirst.mockResolvedValue({
      id: 'credential-id',
      status: CredentialStatus.ACTIVE,
      expiresAt: null,
    });

    const result = await service.getStatus('credential-id', 'university-id');

    expect(mockPrismaService.credential.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'credential-id',
        issuerOrganizationId: 'university-id',
      },
      select: {
        id: true,
        status: true,
        expiresAt: true,
      },
    });

    expect(result).toEqual({
      credentialId: 'credential-id',
      status: CredentialStatus.ACTIVE,
      expiresAt: null,
    });
  });

  it('should reject status lookup for another organizations credential', async () => {
    mockPrismaService.credential.findFirst.mockResolvedValue(null);

    await expect(
      service.getStatus('other-university-credential', 'university-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should scope credential history lookup to the issuer organization', async () => {
    mockPrismaService.credential.findFirst.mockResolvedValue({
      id: 'credential-id',
    });

    mockPrismaService.credentialStatusHistory.findMany.mockResolvedValue([]);

    const result = await service.getHistory('credential-id', 'university-id');

    expect(mockPrismaService.credential.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'credential-id',
        issuerOrganizationId: 'university-id',
      },
      select: {
        id: true,
      },
    });

    expect(
      mockPrismaService.credentialStatusHistory.findMany,
    ).toHaveBeenCalledWith({
      where: {
        credentialId: 'credential-id',
      },
      include: {
        changedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(result).toEqual([]);
  });

  it('should reject a status mutation when the credential changes concurrently', async () => {
    mockPrismaService.credential.findFirst.mockResolvedValue({
      id: 'credential-id',
      issuerOrganizationId: 'university-id',
      status: CredentialStatus.ACTIVE,
    });

    transactionClient.credential.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.suspend({
        credentialId: 'credential-id',
        issuerOrganizationId: 'university-id',
        changedBy: 'issuer-admin-id',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      transactionClient.credentialStatusHistory.create,
    ).not.toHaveBeenCalled();

    expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
  });
});
