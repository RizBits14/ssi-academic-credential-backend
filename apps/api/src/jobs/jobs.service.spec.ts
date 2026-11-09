import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  OrganizationStatus,
  OrganizationType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  const mockPrismaService = {
    organization: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    job: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
      count: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  let service: JobsService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new JobsService(mockPrismaService as unknown as PrismaService);
  });

  it('should create a job for an active bank organization', async () => {
    mockPrismaService.organization.findUnique.mockResolvedValue({
      id: 'bank-id',
      type: OrganizationType.BANK,
      status: OrganizationStatus.ACTIVE,
    });

    mockPrismaService.job.create.mockResolvedValue({
      id: 'job-id',
      bankId: 'bank-id',
      title: 'Graduate Software Engineer',
      requiredClaims: ['degree', 'major', 'cgpa'],
      status: 'OPEN',
    });

    const result = await service.create({
      bankId: 'bank-id',
      title: 'Graduate Software Engineer',
      requiredClaims: ['degree', 'major', 'cgpa'],
    });

    expect(mockPrismaService.job.create).toHaveBeenCalledWith({
      data: {
        bankId: 'bank-id',
        title: 'Graduate Software Engineer',
        description: undefined,
        requiredClaims: ['degree', 'major', 'cgpa'],
        status: 'OPEN',
      },
      include: {
        bank: true,
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'OPEN',
      }),
    );
  });

  it('should reject a non-bank organization', async () => {
    mockPrismaService.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      type: OrganizationType.UNIVERSITY,
      status: OrganizationStatus.ACTIVE,
    });

    await expect(
      service.create({
        bankId: 'university-id',
        title: 'Graduate Role',
        requiredClaims: ['degree'],
      }),
    ).rejects.toThrow('Only bank organizations can own jobs');
  });

  it('should reject an inactive bank organization', async () => {
    mockPrismaService.organization.findUnique.mockResolvedValue({
      id: 'bank-id',
      type: OrganizationType.BANK,
      status: OrganizationStatus.SUSPENDED,
    });

    await expect(
      service.create({
        bankId: 'bank-id',
        title: 'Graduate Role',
        requiredClaims: ['degree'],
      }),
    ).rejects.toThrow('Bank organization is not active');

    expect(mockPrismaService.job.create).not.toHaveBeenCalled();
  });

  it('should reject duplicate required claims', async () => {
    mockPrismaService.organization.findUnique.mockResolvedValue({
      id: 'bank-id',
      type: OrganizationType.BANK,
      status: OrganizationStatus.ACTIVE,
    });

    await expect(
      service.create({
        bankId: 'bank-id',
        title: 'Graduate Role',
        requiredClaims: ['degree', 'degree'],
      }),
    ).rejects.toThrow('Required claims cannot contain duplicates');
  });

  it('should return a job by id', async () => {
    mockPrismaService.job.findUnique.mockResolvedValue({
      id: 'job-id',
      title: 'Graduate Software Engineer',
      status: 'OPEN',
    });

    const result = await service.findOne('job-id');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'job-id',
      }),
    );
  });

  it('should update a job owned by the bank', async () => {
    mockPrismaService.job.findFirst
      .mockResolvedValueOnce({
        id: 'job-id',
        bankId: 'bank-id',
        status: 'OPEN',
      })
      .mockResolvedValueOnce({
        id: 'job-id',
        bankId: 'bank-id',
        title: 'Updated Graduate Engineer',
        requiredClaims: ['degree', 'major'],
        status: 'OPEN',
      });

    mockPrismaService.job.updateMany.mockResolvedValue({
      count: 1,
    });

    const result = await service.update('job-id', 'bank-id', {
      title: 'Updated Graduate Engineer',
      requiredClaims: ['degree', 'major'],
    });

    expect(mockPrismaService.job.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'job-id',
        bankId: 'bank-id',
      },
      data: {
        title: 'Updated Graduate Engineer',
        description: undefined,
        requiredClaims: ['degree', 'major'],
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        title: 'Updated Graduate Engineer',
      }),
    );
  });

  it('should reject updating a job not owned by the bank', async () => {
    mockPrismaService.job.findFirst.mockResolvedValue(null);

    await expect(
      service.update('job-id', 'different-bank-id', {
        title: 'Changed title',
      }),
    ).rejects.toThrow('Job not found');

    expect(mockPrismaService.job.updateMany).not.toHaveBeenCalled();
  });
});
