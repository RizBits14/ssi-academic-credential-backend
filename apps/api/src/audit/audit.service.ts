import { Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAuditLogInput {
  actorId?: string;
  organizationId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Prisma.InputJsonObject;
  ipAddress?: string;
  userAgent?: string;
}

export interface FindAuditLogsInput {
  page: number;
  limit: number;
  action?: string;
  organizationId?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAuditLogInput) {
    const data: Prisma.AuditLogCreateInput = {
      action: input.action,
    };

    if (input.actorId !== undefined) {
      data.actorId = input.actorId;
    }

    if (input.organizationId !== undefined) {
      data.organizationId = input.organizationId;
    }

    if (input.resourceType !== undefined) {
      data.resourceType = input.resourceType;
    }

    if (input.resourceId !== undefined) {
      data.resourceId = input.resourceId;
    }

    if (input.metadata !== undefined) {
      data.metadata = input.metadata;
    }

    if (input.ipAddress !== undefined) {
      data.ipAddress = input.ipAddress;
    }

    if (input.userAgent !== undefined) {
      data.userAgent = input.userAgent;
    }

    return this.prisma.auditLog.create({
      data,
    });
  }

  async findAll(input: FindAuditLogsInput) {
    const where: Prisma.AuditLogWhereInput = {};

    if (input.action) {
      where.action = input.action;
    }

    if (input.organizationId) {
      where.organizationId = input.organizationId;
    }

    const skip = (input.page - 1) * input.limit;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: input.limit,
      }),

      this.prisma.auditLog.count({
        where,
      }),
    ]);

    return {
      data,
      meta: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / input.limit),
      },
    };
  }
}
