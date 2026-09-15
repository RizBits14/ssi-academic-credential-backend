import { describe, expect, it, jest } from '@jest/globals';

import { OrganizationType } from '../generated/prisma/enums';
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
    },
  };

  const service = new JobsService(
    mockPrismaService as unknown as PrismaService,
  );

  it('should create a job for a bank organization', async () => {
    mockPrismaService.organization.findUnique.mockResolvedValue({
      id: 'bank-id',
      type: OrganizationType.BANK,
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
    });

    await expect(
      service.create({
        bankId: 'university-id',
        title: 'Graduate Role',
        requiredClaims: ['degree'],
      }),
    ).rejects.toThrow('Only bank organizations can own jobs');
  });

  it('should reject duplicate required claims', async () => {
    mockPrismaService.organization.findUnique.mockResolvedValue({
      id: 'bank-id',
      type: OrganizationType.BANK,
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
});
