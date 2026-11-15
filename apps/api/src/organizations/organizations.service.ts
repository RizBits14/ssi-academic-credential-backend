import { ForbiddenException, Injectable } from '@nestjs/common';

import { createPaginationMeta } from '../common/utils/pagination.util';
import type { Prisma } from '../generated/prisma/client';
import {
  OrganizationStatus,
  OrganizationType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.organization.findUnique({
      where: { id },
    });
  }

  async findBySlug(slug: string) {
    return this.prisma.organization.findUnique({
      where: { slug },
    });
  }

  async findAllPaginated(input: {
    page: number;
    limit: number;
    search?: string;
    type?: OrganizationType;
    status?: OrganizationStatus;
  }) {
    const where: Prisma.OrganizationWhereInput = {};

    if (input.type) {
      where.type = input.type;
    }

    if (input.status) {
      where.status = input.status;
    }

    if (input.search) {
      where.OR = [
        {
          name: {
            contains: input.search,
            mode: 'insensitive',
          },
        },
        {
          slug: {
            contains: input.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const skip = (input.page - 1) * input.limit;

    const [data, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          email: true,
          website: true,
          status: true,
          createdAt: true,
          updatedAt: true,
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
        },
        orderBy: [
          {
            createdAt: 'desc',
          },
          {
            id: 'asc',
          },
        ],
        skip,
        take: input.limit,
      }),
      this.prisma.organization.count({
        where,
      }),
    ]);

    return {
      data,
      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }

  async findActiveMembershipForUser(
    userId: string,
    organizationType: OrganizationType,
  ) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: {
        userId,
        organization: {
          is: {
            type: organizationType,
            status: OrganizationStatus.ACTIVE,
          },
        },
      },
      include: {
        organization: true,
      },
      take: 2,
    });

    if (memberships.length > 1) {
      throw new ForbiddenException(
        'Multiple active organization memberships require explicit organization context',
      );
    }

    return memberships[0] ?? null;
  }
}
