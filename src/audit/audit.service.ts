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

  async findAll() {
    return this.prisma.auditLog.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
