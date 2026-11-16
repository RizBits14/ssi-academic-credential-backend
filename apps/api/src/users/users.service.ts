import { Injectable, NotFoundException } from '@nestjs/common';

import { createPaginationMeta } from '../common/utils/pagination.util';
import type { Prisma } from '../generated/prisma/client';
import { UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}

interface FindUsersInput {
  page: number;
  limit: number;
  search?: string;
  role?: UserRole;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(input: CreateUserInput) {
    return this.prisma.user.create({
      data: input,
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findAllPaginated(input: FindUsersInput) {
    const where: Prisma.UserWhereInput = {};

    if (input.role) {
      where.role = input.role;
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
          email: {
            contains: input.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const skip = (input.page - 1) * input.limit;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              organizationMemberships: true,
              academicRecords: true,
              credentials: true,
              applications: true,
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

      this.prisma.user.count({
        where,
      }),
    ]);

    return {
      data,
      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }

  async findAdminDetailsById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,

        organizationMemberships: {
          select: {
            id: true,
            createdAt: true,
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
                type: true,
                status: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },

        _count: {
          select: {
            organizationMemberships: true,
            academicRecords: true,
            credentials: true,
            walletCredentials: true,
            applications: true,
            verificationRequestsCreated: true,
            verificationRequestsReceived: true,
            presentations: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const recentActivities = await this.prisma.auditLog.findMany({
      where: {
        actorId: id,
      },
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        organizationId: true,
        createdAt: true,
      },
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          id: 'asc',
        },
      ],
      take: 10,
    });

    return {
      ...user,
      recentActivities,
    };
  }
}
