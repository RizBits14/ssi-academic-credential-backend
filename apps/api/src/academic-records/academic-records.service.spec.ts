import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { AcademicRecordStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AcademicRecordsService } from './academic-records.service';

describe('AcademicRecordsService', () => {
  const transactionClient = {
    academicRecord: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
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

  it('should update an academic record and write an audit log atomically', async () => {
    const updatedRecord = {
      id: 'record-id',
      universityId: 'university-id',
      major: 'Software Engineering',
    };

    transactionClient.academicRecord.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionClient.academicRecord.findFirst.mockResolvedValue(updatedRecord);

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.update(
      'record-id',
      'university-id',
      {
        major: 'Software Engineering',
        fullName: undefined,
      },
      'issuer-admin-id',
    );

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    expect(transactionClient.academicRecord.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'record-id',
        universityId: 'university-id',
      },
      data: {
        major: 'Software Engineering',
      },
    });

    expect(transactionClient.academicRecord.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'record-id',
        universityId: 'university-id',
      },
    });

    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'issuer-admin-id',
        organizationId: 'university-id',
        action: 'ACADEMIC_RECORD_UPDATED',
        resourceType: 'AcademicRecord',
        resourceId: 'record-id',
        metadata: {
          changedFields: ['major'],
        },
      },
    });

    expect(result).toEqual(updatedRecord);
  });

  it('should reject updates to records outside the specified university', async () => {
    transactionClient.academicRecord.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.update(
        'record-from-another-university',
        'university-id',
        {
          major: 'Software Engineering',
        },
        'issuer-admin-id',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(transactionClient.academicRecord.findFirst).not.toHaveBeenCalled();

    expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
  });

  it('should record the new status when an academic record status changes', async () => {
    transactionClient.academicRecord.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionClient.academicRecord.findFirst.mockResolvedValue({
      id: 'record-id',
      universityId: 'university-id',
      status: AcademicRecordStatus.WITHDRAWN,
    });

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    await service.update(
      'record-id',
      'university-id',
      {
        status: AcademicRecordStatus.WITHDRAWN,
      },
      'issuer-admin-id',
    );

    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'issuer-admin-id',
        organizationId: 'university-id',
        action: 'ACADEMIC_RECORD_UPDATED',
        resourceType: 'AcademicRecord',
        resourceId: 'record-id',
        metadata: {
          changedFields: ['status'],
          newStatus: AcademicRecordStatus.WITHDRAWN,
        },
      },
    });
  });

  it('should reject updates without any supplied fields', async () => {
    await expect(
      service.update(
        'record-id',
        'university-id',
        {
          fullName: undefined,
          major: undefined,
        },
        'issuer-admin-id',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();

    expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
  });

  it('should reject the update if audit logging fails', async () => {
    transactionClient.academicRecord.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionClient.academicRecord.findFirst.mockResolvedValue({
      id: 'record-id',
      universityId: 'university-id',
      major: 'Software Engineering',
    });

    transactionClient.auditLog.create.mockRejectedValue(
      new Error('Audit write unavailable'),
    );

    await expect(
      service.update(
        'record-id',
        'university-id',
        {
          major: 'Software Engineering',
        },
        'issuer-admin-id',
      ),
    ).rejects.toThrow('Audit write unavailable');

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    expect(transactionClient.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
