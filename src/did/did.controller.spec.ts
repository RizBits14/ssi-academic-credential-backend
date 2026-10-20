import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { OrganizationType, UserRole } from '../generated/prisma/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { DidController } from './did.controller';
import { DidService } from './did.service';

describe('DidController', () => {
  const mockDidService = {
    resolveDid: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    rotateForOrganization: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    revokeHistoricalKeyForOrganization:
      jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    recoverForOrganization: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    rotateForUser: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    revokeHistoricalKeyForUser:
      jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    recoverForUser: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  const mockOrganizationsService = {
    findActiveMembershipForUser:
      jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  let controller: DidController;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new DidController(
      mockDidService as unknown as DidService,
      mockOrganizationsService as unknown as OrganizationsService,
    );
  });

  function requestFor(userId: string, role: UserRole): AuthenticatedRequest {
    return {
      user: {
        sub: userId,
        email: `${userId}@example.com`,
        role,
      },
    } as unknown as AuthenticatedRequest;
  }

  it('should scope issuer DID rotation to the active university membership', async () => {
    mockOrganizationsService.findActiveMembershipForUser.mockResolvedValue({
      organization: {
        id: 'university-id',
      },
    });

    mockDidService.rotateForOrganization.mockResolvedValue({
      keyVersion: 2,
    });

    const request = requestFor('issuer-admin-id', UserRole.ISSUER_ADMIN);

    await controller.rotateOrganization(request);

    expect(
      mockOrganizationsService.findActiveMembershipForUser,
    ).toHaveBeenCalledWith('issuer-admin-id', OrganizationType.UNIVERSITY);

    expect(mockDidService.rotateForOrganization).toHaveBeenCalledWith(
      'university-id',
      'issuer-admin-id',
    );
  });

  it('should scope verifier DID recovery to the active bank membership', async () => {
    mockOrganizationsService.findActiveMembershipForUser.mockResolvedValue({
      organization: {
        id: 'bank-id',
      },
    });

    mockDidService.recoverForOrganization.mockResolvedValue({
      keyVersion: 3,
    });

    const request = requestFor('verifier-admin-id', UserRole.VERIFIER_ADMIN);

    await controller.recoverOrganization(request, {
      reason: 'Current bank key compromised',
    });

    expect(
      mockOrganizationsService.findActiveMembershipForUser,
    ).toHaveBeenCalledWith('verifier-admin-id', OrganizationType.BANK);

    expect(mockDidService.recoverForOrganization).toHaveBeenCalledWith(
      'bank-id',
      'verifier-admin-id',
      'Current bank key compromised',
    );
  });

  it('should reject organization key management without an active membership', async () => {
    mockOrganizationsService.findActiveMembershipForUser.mockResolvedValue(
      null,
    );

    const request = requestFor('issuer-admin-id', UserRole.ISSUER_ADMIN);

    await expect(controller.rotateOrganization(request)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(mockDidService.rotateForOrganization).not.toHaveBeenCalled();
  });

  it('should manage holder DID keys only for the authenticated holder identity', async () => {
    mockDidService.revokeHistoricalKeyForUser.mockResolvedValue({
      keyVersion: 1,
    });

    const request = requestFor('holder-id', UserRole.HOLDER);

    await controller.revokeHolderKey(request, 1, {
      reason: 'Historical key compromise',
    });

    expect(mockDidService.revokeHistoricalKeyForUser).toHaveBeenCalledWith(
      'holder-id',
      1,
      'Historical key compromise',
    );
  });
});
