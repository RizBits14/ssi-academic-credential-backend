import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type CreateAuditLogInput } from './audit.service';

describe('AuditService', () => {
  const mockPrismaService = {
    auditLog: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),

      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),

      count: jest.fn<(...args: unknown[]) => Promise<number>>(),
    },
  };

  let service: AuditService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new AuditService(mockPrismaService as unknown as PrismaService);
  });

  it('should create an audit log', async () => {
    mockPrismaService.auditLog.create.mockResolvedValue({
      id: 'audit-id',
      action: 'CREDENTIAL_VERIFIED',
    });

    const input: CreateAuditLogInput = {
      actorId: 'user-id',
      organizationId: 'bank-id',
      action: 'CREDENTIAL_VERIFIED',
      resourceType: 'Presentation',
      resourceId: 'presentation-id',
      metadata: {
        verificationResultId: 'verification-result-id',
      },
    };

    const result = await service.create(input);

    expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'user-id',
        organizationId: 'bank-id',
        action: 'CREDENTIAL_VERIFIED',
        resourceType: 'Presentation',
        resourceId: 'presentation-id',
        metadata: {
          verificationResultId: 'verification-result-id',
        },
      },
    });

    expect(result).toEqual({
      id: 'audit-id',
      action: 'CREDENTIAL_VERIFIED',
    });
  });

  it('should return paginated audit logs', async () => {
    mockPrismaService.auditLog.findMany.mockResolvedValue([
      {
        id: 'audit-1',
        action: 'CREDENTIAL_VERIFIED',
      },
    ]);

    mockPrismaService.auditLog.count.mockResolvedValue(21);

    const result = await service.findAll({
      page: 2,
      limit: 10,
      action: 'CREDENTIAL_VERIFIED',
      organizationId: 'bank-id',
    });

    expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        action: 'CREDENTIAL_VERIFIED',
        organizationId: 'bank-id',
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: 10,
      take: 10,
    });

    expect(mockPrismaService.auditLog.count).toHaveBeenCalledWith({
      where: {
        action: 'CREDENTIAL_VERIFIED',
        organizationId: 'bank-id',
      },
    });

    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 21,
      totalPages: 3,
    });
  });
});
