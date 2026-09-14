import { Injectable, NotFoundException } from '@nestjs/common';
import { AcademicRecordStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

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
    return this.prisma.academicRecord.create({
      data: input,
    });
  }

  async findById(id: string) {
    const record = await this.prisma.academicRecord.findUnique({
      where: { id },
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

  async update(id: string, input: UpdateAcademicRecordInput) {
    await this.findById(id);

    return this.prisma.academicRecord.update({
      where: { id },
      data: input,
    });
  }
}
