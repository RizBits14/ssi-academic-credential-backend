import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type CreateAuditLogInput } from './audit.service';

describe('AuditService', () => {
  const mockPrismaService = {
    auditLog: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),

      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
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

  it('should list audit logs newest first', async () => {
    mockPrismaService.auditLog.findMany.mockResolvedValue([]);

    const result = await service.findAll();

    expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith({
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(result).toEqual([]);
  });
});
