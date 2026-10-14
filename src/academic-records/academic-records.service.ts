import { Injectable, NotFoundException } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { AcademicRecordStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { createPaginationMeta } from '../common/utils/pagination.util';

interface CreateAcademicRecordInput {
  universityId: string;
  holderId: string;
  studentId: string;
  fullName: string;
  degree: string;
  department?: string;
  major: string;
  cgpa?: number;
  graduationYear: number;
  graduationDate?: Date;
  actorId: string;
}

interface UpdateAcademicRecordInput {
  fullName?: string;
  degree?: string;
  department?: string;
  major?: string;
  cgpa?: number;
  graduationYear?: number;
  graduationDate?: Date;
  status?: AcademicRecordStatus;
}

@Injectable()
export class AcademicRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAcademicRecordInput) {
    const { actorId, ...recordData } = input;

    return this.prisma.$transaction(async (transaction) => {
      const record = await transaction.academicRecord.create({
        data: recordData,
      });

      await transaction.auditLog.create({
        data: {
          actorId,
          organizationId: input.universityId,
          action: 'ACADEMIC_RECORD_CREATED',
          resourceType: 'AcademicRecord',
          resourceId: record.id,
          metadata: {
            holderId: input.holderId,
            studentId: input.studentId,
          },
        },
      });

      return record;
    });
  }

  async findByIdForUniversity(id: string, universityId: string) {
    const record = await this.prisma.academicRecord.findFirst({
      where: {
        id,
        universityId,
      },
    });

    if (!record) {
      throw new NotFoundException('Academic record not found');
    }

    return record;
  }

  async findByUniversity(universityId: string) {
    return this.prisma.academicRecord.findMany({
      where: {
        universityId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async update(
    id: string,
    universityId: string,
    input: UpdateAcademicRecordInput,
  ) {
    const result = await this.prisma.academicRecord.updateMany({
      where: {
        id,
        universityId,
      },
      data: input,
    });

    if (result.count !== 1) {
      throw new NotFoundException('Academic record not found');
    }

    return this.findByIdForUniversity(id, universityId);
  }

  async findByUniversityPaginated(input: {
    universityId: string;
    page: number;
    limit: number;
    status?: AcademicRecordStatus;
    holderId?: string;
    studentId?: string;
  }) {
    const where: Prisma.AcademicRecordWhereInput = {
      universityId: input.universityId,
    };

    if (input.status) {
      where.status = input.status;
    }

    if (input.holderId) {
      where.holderId = input.holderId;
    }

    if (input.studentId) {
      where.studentId = input.studentId;
    }

    const skip = (input.page - 1) * input.limit;

    const [data, total] = await Promise.all([
      this.prisma.academicRecord.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: input.limit,
      }),

      this.prisma.academicRecord.count({
        where,
      }),
    ]);

    return {
      data,
      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }
}
