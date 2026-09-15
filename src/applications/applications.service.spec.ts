import { describe, expect, it, jest } from '@jest/globals';

import {
  ApplicationStatus,
  EducationVerificationStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationsService } from './applications.service';

describe('ApplicationsService', () => {
  const mockPrismaService = {
    job: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    application: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const service = new ApplicationsService(
    mockPrismaService as unknown as PrismaService,
  );

  it('should create an application for an open job', async () => {
    mockPrismaService.job.findUnique.mockResolvedValue({
      id: 'job-id',
      status: 'OPEN',
    });

    mockPrismaService.application.create.mockResolvedValue({
      id: 'application-id',
      jobId: 'job-id',
      holderId: 'holder-id',
      status: ApplicationStatus.DRAFT,
      educationVerificationStatus: EducationVerificationStatus.NOT_VERIFIED,
    });

    const result = await service.create({
      jobId: 'job-id',
      holderId: 'holder-id',
    });

    expect(mockPrismaService.application.create).toHaveBeenCalledWith({
      data: {
        jobId: 'job-id',
        holderId: 'holder-id',
        status: ApplicationStatus.DRAFT,
        educationVerificationStatus: EducationVerificationStatus.NOT_VERIFIED,
      },
      include: {
        job: {
          include: {
            bank: true,
          },
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: ApplicationStatus.DRAFT,
        educationVerificationStatus: EducationVerificationStatus.NOT_VERIFIED,
      }),
    );
  });

  it('should reject application for a closed job', async () => {
    mockPrismaService.job.findUnique.mockResolvedValue({
      id: 'job-id',
      status: 'CLOSED',
    });

    await expect(
      service.create({
        jobId: 'job-id',
        holderId: 'holder-id',
      }),
    ).rejects.toThrow('Applications can only be created for open jobs');
  });

  it('should return holder applications', async () => {
    mockPrismaService.application.findMany.mockResolvedValue([
      {
        id: 'application-id',
        holderId: 'holder-id',
      },
    ]);

    const result = await service.findByHolder('holder-id');

    expect(result).toHaveLength(1);
  });

  it('should return an application by id', async () => {
    mockPrismaService.application.findUnique.mockResolvedValue({
      id: 'application-id',
      holderId: 'holder-id',
    });

    const result = await service.findOne('application-id');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'application-id',
      }),
    );
  });
});
