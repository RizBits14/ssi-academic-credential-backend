import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { OrganizationType, UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  const mockPrisma = {
    organization: {
      count: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    user: {
      count: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    academicRecord: {
      count: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    credential: {
      count: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    trustedIssuer: {
      count: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    auditLog: {
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  let adminService: AdminService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPrisma.organization.count.mockResolvedValue(0);
    mockPrisma.organization.findMany.mockResolvedValue([]);

    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.user.findMany.mockResolvedValue([]);

    mockPrisma.academicRecord.count.mockResolvedValue(0);
    mockPrisma.credential.count.mockResolvedValue(0);
    mockPrisma.trustedIssuer.count.mockResolvedValue(0);

    mockPrisma.auditLog.findMany.mockResolvedValue([]);

    adminService = new AdminService(mockPrisma as unknown as PrismaService);
  });

  it('should return dashboard statistics and recent activities', async () => {
    const createdAt = new Date('2026-11-16T10:00:00.000Z');

    mockPrisma.organization.count.mockResolvedValue(2);
    mockPrisma.user.count.mockResolvedValue(4);
    mockPrisma.academicRecord.count.mockResolvedValue(3);
    mockPrisma.credential.count.mockResolvedValue(2);
    mockPrisma.trustedIssuer.count.mockResolvedValue(1);

    mockPrisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'audit-id',
        actorId: 'user-id',
        organizationId: 'organization-id',
        action: 'ORGANIZATION_CREATED',
        resourceType: 'Organization',
        resourceId: 'organization-id',
        createdAt,
      },
    ]);

    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'user-id',
        name: 'System Administrator',
        role: UserRole.SYSTEM_ADMIN,
      },
    ]);

    mockPrisma.organization.findMany.mockResolvedValue([
      {
        id: 'organization-id',
        name: 'Northbridge University',
        type: OrganizationType.UNIVERSITY,
      },
    ]);

    const result = await adminService.getDashboardOverview();

    expect(result.organizations.total).toBe(2);
    expect(result.users.total).toBe(4);
    expect(result.academicRecords.total).toBe(3);
    expect(result.credentials.total).toBe(2);
    expect(result.trustedIssuers.total).toBe(1);

    expect(result.recentActivities).toHaveLength(1);

    expect(result.recentActivities[0]).toEqual({
      id: 'audit-id',
      action: 'ORGANIZATION_CREATED',
      resourceType: 'Organization',
      resourceId: 'organization-id',
      createdAt,
      actor: {
        id: 'user-id',
        name: 'System Administrator',
        role: UserRole.SYSTEM_ADMIN,
      },
      organization: {
        id: 'organization-id',
        name: 'Northbridge University',
        type: OrganizationType.UNIVERSITY,
      },
    });

    expect(mockPrisma.organization.count).toHaveBeenCalledWith({
      where: {
        type: OrganizationType.UNIVERSITY,
      },
    });

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        actorId: true,
        organizationId: true,
        action: true,
        resourceType: true,
        resourceId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });
  });

  it('should return empty recent activities when no audit logs exist', async () => {
    const result = await adminService.getDashboardOverview();

    expect(result.recentActivities).toEqual([]);
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: [],
        },
      },
      select: {
        id: true,
        name: true,
        role: true,
      },
    });

    expect(mockPrisma.organization.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: [],
        },
      },
      select: {
        id: true,
        name: true,
        type: true,
      },
    });
  });
});
