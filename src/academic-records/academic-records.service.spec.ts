import { describe, expect, it, jest } from '@jest/globals';
import { PrismaService } from '../prisma/prisma.service';
import { AcademicRecordsService } from './academic-records.service';

describe('AcademicRecordsService', () => {
  const mockPrisma = {
    academicRecord: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const service = new AcademicRecordsService(
    mockPrisma as unknown as PrismaService,
  );

  it('should create an academic record', async () => {
    const input = {
      universityId: 'university-id',
      holderId: 'holder-id',
      studentId: '20260001',
      fullName: 'Sample Applicant',
      degree: 'Bachelor of Science',
      major: 'Computer Science',
      cgpa: 3.75,
      graduationYear: 2026,
    };

    mockPrisma.academicRecord.create.mockResolvedValue(input);

    const result = await service.create(input);

    expect(mockPrisma.academicRecord.create).toHaveBeenCalledWith({
      data: input,
    });

    expect(result).toEqual(input);
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
