import { ForbiddenException, Injectable } from '@nestjs/common';

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

  async findMembershipForUser(userId: string) {
    return this.prisma.organizationMember.findFirst({
      where: { userId },
      include: {
        organization: true,
      },
    });
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
