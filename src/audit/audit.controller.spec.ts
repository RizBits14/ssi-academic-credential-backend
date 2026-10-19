import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { OrganizationType, UserRole } from '../generated/prisma/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

describe('AuditController', () => {
  const mockAuditService = {
    findAll: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  const mockOrganizationsService = {
    findActiveMembershipForUser:
      jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  let controller: AuditController;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new AuditController(
      mockAuditService as unknown as AuditService,
      mockOrganizationsService as unknown as OrganizationsService,
    );

    mockAuditService.findAll.mockResolvedValue({
      data: [],
      meta: {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      },
    });
  });

  it('should allow a system admin to query all audit logs', async () => {
    const request = {
      user: {
        sub: 'system-admin-id',
        role: UserRole.SYSTEM_ADMIN,
      },
    } as unknown as AuthenticatedRequest;

    await controller.findAll(request, {
      page: 1,
      limit: 10,
    });

    expect(
      mockOrganizationsService.findActiveMembershipForUser,
    ).not.toHaveBeenCalled();

    expect(mockAuditService.findAll).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      action: undefined,
      organizationId: undefined,
    });
  });

  it('should scope an issuer admin to an active university', async () => {
    mockOrganizationsService.findActiveMembershipForUser.mockResolvedValue({
      organization: {
        id: 'university-id',
        type: OrganizationType.UNIVERSITY,
      },
    });

    const request = {
      user: {
        sub: 'issuer-admin-id',
        role: UserRole.ISSUER_ADMIN,
      },
    } as unknown as AuthenticatedRequest;

    await controller.findAll(request, {
      page: 1,
      limit: 10,
    });

    expect(
      mockOrganizationsService.findActiveMembershipForUser,
    ).toHaveBeenCalledWith('issuer-admin-id', OrganizationType.UNIVERSITY);

    expect(mockAuditService.findAll).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      action: undefined,
      organizationId: 'university-id',
    });
  });

  it('should scope a verifier admin to an active bank', async () => {
    mockOrganizationsService.findActiveMembershipForUser.mockResolvedValue({
      organization: {
        id: 'bank-id',
        type: OrganizationType.BANK,
      },
    });

    const request = {
      user: {
        sub: 'verifier-admin-id',
        role: UserRole.VERIFIER_ADMIN,
      },
    } as unknown as AuthenticatedRequest;

    await controller.findAll(request, {
      page: 1,
      limit: 10,
    });

    expect(
      mockOrganizationsService.findActiveMembershipForUser,
    ).toHaveBeenCalledWith('verifier-admin-id', OrganizationType.BANK);

    expect(mockAuditService.findAll).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      action: undefined,
      organizationId: 'bank-id',
    });
  });

  it('should reject an issuer admin without an active university membership', async () => {
    mockOrganizationsService.findActiveMembershipForUser.mockResolvedValue(
      null,
    );

    const request = {
      user: {
        sub: 'issuer-admin-id',
        role: UserRole.ISSUER_ADMIN,
      },
    } as unknown as AuthenticatedRequest;

    await expect(
      controller.findAll(request, {
        page: 1,
        limit: 10,
      }),
    ).rejects.toThrow('University membership required');

    expect(mockAuditService.findAll).not.toHaveBeenCalled();
  });

  it('should reject a verifier admin without an active bank membership', async () => {
    mockOrganizationsService.findActiveMembershipForUser.mockResolvedValue(
      null,
    );

    const request = {
      user: {
        sub: 'verifier-admin-id',
        role: UserRole.VERIFIER_ADMIN,
      },
    } as unknown as AuthenticatedRequest;

    await expect(
      controller.findAll(request, {
        page: 1,
        limit: 10,
      }),
    ).rejects.toThrow('Bank membership required');

    expect(mockAuditService.findAll).not.toHaveBeenCalled();
  });
});
