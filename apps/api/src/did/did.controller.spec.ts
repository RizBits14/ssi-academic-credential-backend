import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import {
  DidOwnerType,
  OrganizationType,
  UserRole,
} from '../generated/prisma/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { DidController } from './did.controller';
import { DidService } from './did.service';

describe('DidController', () => {
  const mockDidService = {
    resolveDid: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    findPublicByOwner: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    createForUser: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
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

  it('should enroll a DID for the currently authenticated holder', async () => {
    const created = {
      id: 'did-record-id',
      did: 'did:mock:holder:123',
      ownerType: DidOwnerType.USER,
      ownerId: 'holder-id',
      currentKeyVersion: 1,
      status: 'ACTIVE',
    };

    mockDidService.createForUser.mockResolvedValue(created);

    const result = await controller.enrollHolder(
      requestFor('holder-id', UserRole.HOLDER),
    );

    expect(mockDidService.createForUser).toHaveBeenCalledTimes(1);
    expect(mockDidService.createForUser).toHaveBeenCalledWith('holder-id');
    expect(result).toEqual(created);
  });

  it('should return only the authenticated holder DID', async () => {
    const record = {
      id: 'did-record-id',
      did: 'did:mock:holder:123',
      ownerType: DidOwnerType.USER,
      ownerId: 'holder-id',
      currentKeyVersion: 1,
      status: 'ACTIVE',
    };

    mockDidService.findPublicByOwner.mockResolvedValue(record);

    const result = await controller.getMyDid(
      requestFor('holder-id', UserRole.HOLDER),
    );

    expect(mockDidService.findPublicByOwner).toHaveBeenCalledWith(
      DidOwnerType.USER,
      'holder-id',
    );
    expect(result).toEqual(record);
  });

  it('should reject a holder DID lookup when onboarding is incomplete', async () => {
    mockDidService.findPublicByOwner.mockResolvedValue(null);

    await expect(
      controller.getMyDid(requestFor('new-holder-id', UserRole.HOLDER)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should preserve the duplicate-enrollment conflict from the DID service', async () => {
    mockDidService.createForUser.mockRejectedValue(
      new ConflictException('User already has a DID'),
    );

    await expect(
      controller.enrollHolder(requestFor('holder-id', UserRole.HOLDER)),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('should expose a standards-facing DID document without the internal PEM key', async () => {
    const did = 'did:mock:holder:123';
    const verificationMethodId = `${did}#key-2`;

    mockDidService.resolveDid.mockResolvedValue({
      id: did,
      controller: did,
      verificationMethod: {
        id: verificationMethodId,
        type: 'Multikey',
        controller: did,
        publicKeyMultibase: 'z6MkgQwwKwDwbL7FKfhzEifRHxNCwq27TM7AWrtkhu4Npa41',
        publicKey: `-----BEGIN PUBLIC KEY-----
INTERNAL_PEM_KEY
-----END PUBLIC KEY-----`,
      },
      status: 'ACTIVE',
    });

    const result = await controller.resolve(did);

    expect(mockDidService.resolveDid).toHaveBeenCalledWith(did);

    expect(result).toEqual({
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/multikey/v1',
      ],
      id: did,
      verificationMethod: [
        {
          id: verificationMethodId,
          type: 'Multikey',
          controller: did,
          publicKeyMultibase:
            'z6MkgQwwKwDwbL7FKfhzEifRHxNCwq27TM7AWrtkhu4Npa41',
        },
      ],
      authentication: [verificationMethodId],
      assertionMethod: [verificationMethodId],
    });

    expect(result.verificationMethod[0]).not.toHaveProperty('publicKey');
  });

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
      undefined,
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
      undefined,
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
