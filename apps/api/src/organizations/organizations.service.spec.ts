import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  OrganizationStatus,
  OrganizationType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService', () => {
  const mockPrisma = {
    organization: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      count: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    organizationMember: {
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  let organizationsService: OrganizationsService;

  beforeEach(() => {
    jest.clearAllMocks();

    organizationsService = new OrganizationsService(
      mockPrisma as unknown as PrismaService,
    );
  });

  it('should find an organization by slug', async () => {
    const organization = {
      id: 'organization-id',
      slug: 'northbridge-university',
      name: 'Example University',
    };

    mockPrisma.organization.findUnique.mockResolvedValue(organization);

    const result = await organizationsService.findBySlug(
      'northbridge-university',
    );

    expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({
      where: {
        slug: 'northbridge-university',
      },
    });

    expect(result).toEqual(organization);
  });

  it('should return one active university membership', async () => {
    const membership = {
      id: 'membership-id',
      userId: 'user-id',
      organization: {
        id: 'university-id',
        name: 'Example University',
        type: OrganizationType.UNIVERSITY,
        status: OrganizationStatus.ACTIVE,
      },
    };

    mockPrisma.organizationMember.findMany.mockResolvedValue([membership]);

    const result = await organizationsService.findActiveMembershipForUser(
      'user-id',
      OrganizationType.UNIVERSITY,
    );

    expect(mockPrisma.organizationMember.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        organization: {
          is: {
            type: OrganizationType.UNIVERSITY,
            status: OrganizationStatus.ACTIVE,
          },
        },
      },
      include: {
        organization: true,
      },
      take: 2,
    });

    expect(result).toEqual(membership);
  });

  it('should return null when no active membership exists', async () => {
    mockPrisma.organizationMember.findMany.mockResolvedValue([]);

    const result = await organizationsService.findActiveMembershipForUser(
      'user-id',
      OrganizationType.UNIVERSITY,
    );

    expect(result).toBeNull();
  });

  it('should reject ambiguous active memberships', async () => {
    mockPrisma.organizationMember.findMany.mockResolvedValue([
      {
        id: 'membership-1',
        organization: {
          id: 'university-1',
        },
      },
      {
        id: 'membership-2',
        organization: {
          id: 'university-2',
        },
      },
    ]);

    await expect(
      organizationsService.findActiveMembershipForUser(
        'user-id',
        OrganizationType.UNIVERSITY,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should list organizations with pagination and filters', async () => {
    const organizations = [
      {
        id: 'organization-1',
        name: 'Northbridge University',
        slug: 'northbridge-university',
        type: OrganizationType.UNIVERSITY,
        status: OrganizationStatus.ACTIVE,
        _count: {
          members: 12,
          academicRecords: 150,
          credentialSchemas: 3,
          issuedCredentials: 120,
          trustedIssuerRegistrations: 1,
          jobs: 0,
        },
      },
    ];

    mockPrisma.organization.findMany.mockResolvedValue(organizations);
    mockPrisma.organization.count.mockResolvedValue(23);

    const result = await organizationsService.findAllPaginated({
      page: 2,
      limit: 10,
      search: 'northbridge',
      type: OrganizationType.UNIVERSITY,
      status: OrganizationStatus.ACTIVE,
    });

    const where = {
      type: OrganizationType.UNIVERSITY,
      status: OrganizationStatus.ACTIVE,
      OR: [
        {
          name: {
            contains: 'northbridge',
            mode: 'insensitive',
          },
        },
        {
          slug: {
            contains: 'northbridge',
            mode: 'insensitive',
          },
        },
      ],
    };

    expect(mockPrisma.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 10,
        take: 10,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: expect.objectContaining({
          id: true,
          name: true,
          slug: true,
          type: true,
          status: true,
          _count: {
            select: {
              members: true,
              academicRecords: true,
              credentialSchemas: true,
              issuedCredentials: true,
              trustedIssuerRegistrations: true,
              jobs: true,
            },
          },
        }),
      }),
    );

    expect(mockPrisma.organization.count).toHaveBeenCalledWith({
      where,
    });

    expect(result).toEqual({
      data: organizations,
      meta: {
        page: 2,
        limit: 10,
        total: 23,
        totalPages: 3,
      },
    });
  });

  it('should return empty results with correct pagination metadata', async () => {
    mockPrisma.organization.findMany.mockResolvedValue([]);
    mockPrisma.organization.count.mockResolvedValue(0);

    const result = await organizationsService.findAllPaginated({
      page: 1,
      limit: 20,
    });

    expect(result).toEqual({
      data: [],
      meta: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    });
  });
});
