import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { OrganizationType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

interface CreateJobInput {
  bankId: string;
  title: string;
  description?: string;
  requiredClaims: string[];
}

interface UpdateJobInput {
  title?: string;
  description?: string;
  requiredClaims?: string[];
}

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateJobInput) {
    const bank = await this.prisma.organization.findUnique({
      where: {
        id: input.bankId,
      },
    });

    if (!bank) {
      throw new NotFoundException('Bank organization not found');
    }

    if (bank.type !== OrganizationType.BANK) {
      throw new BadRequestException('Only bank organizations can own jobs');
    }

    this.validateRequiredClaims(input.requiredClaims);

    return this.prisma.job.create({
      data: {
        bankId: input.bankId,
        title: input.title,
        description: input.description,
        requiredClaims: input.requiredClaims,
        status: 'OPEN',
      },
      include: {
        bank: true,
      },
    });
  }

  async findAll() {
    return this.prisma.job.findMany({
      include: {
        bank: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const job = await this.prisma.job.findUnique({
      where: {
        id,
      },
      include: {
        bank: true,
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return job;
  }

  private validateRequiredClaims(requiredClaims: string[]) {
    if (!Array.isArray(requiredClaims) || requiredClaims.length === 0) {
      throw new BadRequestException('At least one required claim is required');
    }

    const normalized = requiredClaims.map((claim) => claim.trim());

    if (normalized.some((claim) => claim.length === 0)) {
      throw new BadRequestException(
        'Required claims cannot contain empty values',
      );
    }

    if (new Set(normalized).size !== normalized.length) {
      throw new BadRequestException(
        'Required claims cannot contain duplicates',
      );
    }
  }

  async update(id: string, bankId: string, input: UpdateJobInput) {
    const job = await this.prisma.job.findFirst({
      where: {
        id,
        bankId,
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (input.requiredClaims) {
      this.validateRequiredClaims(input.requiredClaims);
    }

    return this.prisma.job.update({
      where: {
        id,
      },
      data: {
        title: input.title,
        description: input.description,
        requiredClaims: input.requiredClaims,
      },
      include: {
        bank: true,
      },
    });
  }
}
