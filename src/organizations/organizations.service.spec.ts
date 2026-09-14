import { describe, expect, it, jest } from '@jest/globals';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService', () => {
  const mockPrisma = {
    organization: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    organizationMember: {
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const organizationsService = new OrganizationsService(
    mockPrisma as unknown as PrismaService,
  );

  it('should find an organization by slug', async () => {
    const organization = {
      id: 'organization-id',
      slug: 'example-university',
      name: 'Example University',
    };

    mockPrisma.organization.findUnique.mockResolvedValue(organization);

    const result = await organizationsService.findBySlug('example-university');

    expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({
      where: {
        slug: 'example-university',
      },
    });

    expect(result).toEqual(organization);
  });

  it('should find a user organization membership', async () => {
    const membership = {
      id: 'membership-id',
      userId: 'user-id',
      organization: {
        id: 'organization-id',
        name: 'Example University',
      },
    };

    mockPrisma.organizationMember.findFirst.mockResolvedValue(membership);

    const result = await organizationsService.findMembershipForUser('user-id');

    expect(mockPrisma.organizationMember.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
      },
      include: {
        organization: true,
      },
    });

    expect(result).toEqual(membership);
  });
});
