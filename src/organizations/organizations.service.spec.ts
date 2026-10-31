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
});
