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
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
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

  it('should find an academic record by id', async () => {
    const record = {
      id: 'record-id',
      studentId: '20260001',
    };

    mockPrisma.academicRecord.findUnique.mockResolvedValue(record);

    const result = await service.findById('record-id');

    expect(result).toEqual(record);
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

  it('should update an academic record', async () => {
    const existingRecord = {
      id: 'record-id',
      universityId: 'university-id',
      major: 'Computer Science',
    };

    const updatedRecord = {
      ...existingRecord,
      major: 'Software Engineering',
    };

    mockPrisma.academicRecord.findUnique.mockResolvedValue(existingRecord);
    mockPrisma.academicRecord.update.mockResolvedValue(updatedRecord);

    const result = await service.update('record-id', {
      major: 'Software Engineering',
    });

    expect(mockPrisma.academicRecord.update).toHaveBeenCalledWith({
      where: {
        id: 'record-id',
      },
      data: {
        major: 'Software Engineering',
      },
    });

    expect(result).toEqual(updatedRecord);
  });
});
