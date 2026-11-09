import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { DidService } from '../did/did.service';
import {
  DidOwnerType,
  DidStatus,
  OrganizationType,
  TrustedIssuerStatus,
} from '../generated/prisma/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { TrustRegistryService } from './trust-registry.service';

describe('TrustRegistryService', () => {
  const transactionClient = {
    trustedIssuer: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    auditLog: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const mockPrismaService = {
    trustedIssuer: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      count: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    $transaction: jest.fn(
      async (
        callback: (transaction: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    ),
  };

  const mockOrganizationsService = {
    findById: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  const mockDidService = {
    findPublicByDid: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  let service: TrustRegistryService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new TrustRegistryService(
      mockPrismaService as unknown as PrismaService,
      mockOrganizationsService as unknown as OrganizationsService,
      mockDidService as unknown as DidService,
    );
  });

  it('should register a university issuer and create audit log', async () => {
    mockOrganizationsService.findById.mockResolvedValue({
      id: 'university-id',
      type: OrganizationType.UNIVERSITY,
    });

    mockDidService.findPublicByDid.mockResolvedValue({
      did: 'did:mock:university:123',
      ownerType: DidOwnerType.ORGANIZATION,
      ownerId: 'university-id',
      status: DidStatus.ACTIVE,
    });

    mockPrismaService.trustedIssuer.findUnique.mockResolvedValue(null);

    transactionClient.trustedIssuer.create.mockResolvedValue({
      id: 'trusted-issuer-id',
      organizationId: 'university-id',
      issuerDid: 'did:mock:university:123',
      approvedBy: 'admin-id',
      status: TrustedIssuerStatus.TRUSTED,
    });

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.create({
      organizationId: 'university-id',
      issuerDid: 'did:mock:university:123',
      approvedBy: 'admin-id',
    });

    expect(mockDidService.findPublicByDid).toHaveBeenCalledWith(
      'did:mock:university:123',
    );

    expect(transactionClient.trustedIssuer.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'university-id',
        issuerDid: 'did:mock:university:123',
        approvedBy: 'admin-id',
        status: TrustedIssuerStatus.TRUSTED,
      },
      include: {
        organization: true,
        approvedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'admin-id',
        organizationId: 'university-id',
        action: 'TRUSTED_ISSUER_ADDED',
        resourceType: 'TrustedIssuer',
        resourceId: 'trusted-issuer-id',
        metadata: {
          issuerDid: 'did:mock:university:123',
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: TrustedIssuerStatus.TRUSTED,
      }),
    );
  });

  it('should return true when issuer is trusted', async () => {
    mockPrismaService.trustedIssuer.findUnique.mockResolvedValue({
      issuerDid: 'did:mock:university:123',
      status: TrustedIssuerStatus.TRUSTED,
    });

    await expect(service.isTrusted('did:mock:university:123')).resolves.toBe(
      true,
    );
  });

  it('should return false when issuer is not registered', async () => {
    mockPrismaService.trustedIssuer.findUnique.mockResolvedValue(null);

    await expect(
      service.isTrusted('did:mock:university:missing'),
    ).resolves.toBe(false);
  });

  it('should reject a DID that does not belong to the university', async () => {
    mockOrganizationsService.findById.mockResolvedValue({
      id: 'university-id',
      type: OrganizationType.UNIVERSITY,
    });

    mockDidService.findPublicByDid.mockResolvedValue({
      did: 'did:mock:university:other',
      ownerType: DidOwnerType.ORGANIZATION,
      ownerId: 'another-university-id',
      status: DidStatus.ACTIVE,
    });

    await expect(
      service.create({
        organizationId: 'university-id',
        issuerDid: 'did:mock:university:other',
        approvedBy: 'admin-id',
      }),
    ).rejects.toThrow('Issuer DID does not belong to the organization');
  });

  it('should suspend a trusted issuer and create audit log', async () => {
    mockPrismaService.trustedIssuer.findUnique.mockResolvedValue({
      id: 'trusted-issuer-id',
      organizationId: 'university-id',
      issuerDid: 'did:mock:university:123',
      status: TrustedIssuerStatus.TRUSTED,
    });

    transactionClient.trustedIssuer.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionClient.trustedIssuer.findUnique.mockResolvedValue({
      id: 'trusted-issuer-id',
      issuerDid: 'did:mock:university:123',
      status: TrustedIssuerStatus.SUSPENDED,
      suspendedAt: new Date(),
    });

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.suspend('trusted-issuer-id', 'admin-id');

    expect(transactionClient.trustedIssuer.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'trusted-issuer-id',
        status: TrustedIssuerStatus.TRUSTED,
      },
      data: {
        status: TrustedIssuerStatus.SUSPENDED,
        suspendedAt: expect.any(Date),
      },
    });

    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'admin-id',
        organizationId: 'university-id',
        action: 'TRUSTED_ISSUER_SUSPENDED',
        resourceType: 'TrustedIssuer',
        resourceId: 'trusted-issuer-id',
        metadata: {
          issuerDid: 'did:mock:university:123',
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: TrustedIssuerStatus.SUSPENDED,
      }),
    );
  });

  it('should reject suspension if another request changed the trust status first', async () => {
    mockPrismaService.trustedIssuer.findUnique.mockResolvedValue({
      id: 'trusted-issuer-id',
      organizationId: 'university-id',
      issuerDid: 'did:mock:university:123',
      status: TrustedIssuerStatus.TRUSTED,
    });

    transactionClient.trustedIssuer.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.suspend('trusted-issuer-id', 'admin-id'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transactionClient.trustedIssuer.findUnique).not.toHaveBeenCalled();
    expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
  });

  it('should propagate an audit failure so the transaction can roll back', async () => {
    mockPrismaService.trustedIssuer.findUnique.mockResolvedValue({
      id: 'trusted-issuer-id',
      organizationId: 'university-id',
      issuerDid: 'did:mock:university:123',
      status: TrustedIssuerStatus.TRUSTED,
    });

    transactionClient.trustedIssuer.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionClient.trustedIssuer.findUnique.mockResolvedValue({
      id: 'trusted-issuer-id',
      organizationId: 'university-id',
      issuerDid: 'did:mock:university:123',
      status: TrustedIssuerStatus.SUSPENDED,
    });

    transactionClient.auditLog.create.mockRejectedValue(
      new Error('Audit database operation failed'),
    );

    await expect(
      service.suspend('trusted-issuer-id', 'admin-id'),
    ).rejects.toThrow('Audit database operation failed');

    expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionClient.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('should reject suspending an already suspended issuer', async () => {
    mockPrismaService.trustedIssuer.findUnique.mockResolvedValue({
      id: 'trusted-issuer-id',
      status: TrustedIssuerStatus.SUSPENDED,
    });

    await expect(
      service.suspend('trusted-issuer-id', 'admin-id'),
    ).rejects.toThrow('Only a trusted issuer can be suspended');
  });
});
