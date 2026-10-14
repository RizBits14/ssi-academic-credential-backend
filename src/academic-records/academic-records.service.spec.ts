import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { PrismaService } from '../prisma/prisma.service';
import { AcademicRecordsService } from './academic-records.service';

describe('AcademicRecordsService', () => {
  const transactionClient = {
    academicRecord: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    auditLog: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const mockPrisma = {
    academicRecord: {
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      count: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
    },

    $transaction: jest.fn(
      async (
        callback: (transaction: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    ),
  };

  let service: AcademicRecordsService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new AcademicRecordsService(
      mockPrisma as unknown as PrismaService,
    );
  });

  it('should create an academic record and audit log in one transaction', async () => {
    const input = {
      universityId: 'university-id',
      holderId: 'holder-id',
      studentId: '20260001',
      fullName: 'Sample Applicant',
      degree: 'Bachelor of Science',
      major: 'Computer Science',
      cgpa: 3.75,
      graduationYear: 2026,
      actorId: 'issuer-admin-id',
    };

    transactionClient.academicRecord.create.mockResolvedValue({
      id: 'record-id',
      universityId: 'university-id',
      holderId: 'holder-id',
      studentId: '20260001',
      fullName: 'Sample Applicant',
      degree: 'Bachelor of Science',
      major: 'Computer Science',
      cgpa: 3.75,
      graduationYear: 2026,
    });

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.create(input);

    expect(mockPrisma.$transaction).toHaveBeenCalled();

    expect(transactionClient.academicRecord.create).toHaveBeenCalledWith({
      data: {
        universityId: 'university-id',
        holderId: 'holder-id',
        studentId: '20260001',
        fullName: 'Sample Applicant',
        degree: 'Bachelor of Science',
        major: 'Computer Science',
        cgpa: 3.75,
        graduationYear: 2026,
      },
    });

    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'issuer-admin-id',
        organizationId: 'university-id',
        action: 'ACADEMIC_RECORD_CREATED',
        resourceType: 'AcademicRecord',
        resourceId: 'record-id',
        metadata: {
          holderId: 'holder-id',
          studentId: '20260001',
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'record-id',
        studentId: '20260001',
      }),
    );
  });

  it('should find an academic record only within the specified university', async () => {
    const record = {
      id: 'record-id',
      universityId: 'university-id',
      studentId: '20260001',
    };

    mockPrisma.academicRecord.findFirst.mockResolvedValue(record);

    const result = await service.findByIdForUniversity(
      'record-id',
      'university-id',
    );

    expect(mockPrisma.academicRecord.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'record-id',
        universityId: 'university-id',
      },
    });

    expect(result).toEqual(record);
  });

  it('should reject an academic record outside the specified university', async () => {
    mockPrisma.academicRecord.findFirst.mockResolvedValue(null);

    await expect(
      service.findByIdForUniversity(
        'record-from-another-university',
        'university-id',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should list records for a university', async () => {
    mockPrisma.academicRecord.findMany.mockResolvedValue([]);

    const result = await service.findByUniversity('university-id');

    expect(mockPrisma.academicRecord.findMany).toHaveBeenCalledWith({
      where: {
        universityId: 'university-id',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(result).toEqual([]);
  });

  it('should update an academic record only within the specified university', async () => {
    const updatedRecord = {
      id: 'record-id',
      universityId: 'university-id',
      major: 'Software Engineering',
    };

    mockPrisma.academicRecord.updateMany.mockResolvedValue({
      count: 1,
    });

    mockPrisma.academicRecord.findFirst.mockResolvedValue(updatedRecord);

    const result = await service.update('record-id', 'university-id', {
      major: 'Software Engineering',
    });

    expect(mockPrisma.academicRecord.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'record-id',
        universityId: 'university-id',
      },
      data: {
        major: 'Software Engineering',
      },
    });

    expect(result).toEqual(updatedRecord);
  });

  it('should reject updates to records outside the specified university', async () => {
    mockPrisma.academicRecord.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.update('record-from-another-university', 'university-id', {
        major: 'Software Engineering',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(mockPrisma.academicRecord.findFirst).not.toHaveBeenCalled();
  });
});
