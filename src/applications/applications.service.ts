import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  ApplicationStatus,
  EducationVerificationStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { createPaginationMeta } from '../common/utils/pagination.util';

interface CreateApplicationInput {
  jobId: string;
  holderId: string;
}

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateApplicationInput) {
    const job = await this.prisma.job.findUnique({
      where: {
        id: input.jobId,
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.status !== 'OPEN') {
      throw new BadRequestException(
        'Applications can only be created for open jobs',
      );
    }

    return this.prisma.application.create({
      data: {
        jobId: input.jobId,
        holderId: input.holderId,
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
  }

  async findByHolder(holderId: string) {
    return this.prisma.application.findMany({
      where: {
        holderId,
      },
      include: {
        job: {
          include: {
            bank: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const application = await this.prisma.application.findUnique({
      where: {
        id,
      },
      include: {
        job: {
          include: {
            bank: true,
          },
        },
        holder: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return application;
  }

  async findByHolderPaginated(input: {
    holderId: string;
    page: number;
    limit: number;
    status?: ApplicationStatus;
    educationVerificationStatus?: EducationVerificationStatus;
    jobId?: string;
  }) {
    const where: Prisma.ApplicationWhereInput = {
      holderId: input.holderId,
    };

    if (input.status) {
      where.status = input.status;
    }

    if (input.educationVerificationStatus) {
      where.educationVerificationStatus = input.educationVerificationStatus;
    }

    if (input.jobId) {
      where.jobId = input.jobId;
    }

    const skip = (input.page - 1) * input.limit;

    const [data, total] = await Promise.all([
      this.prisma.application.findMany({
        where,

        include: {
          job: {
            include: {
              bank: true,
            },
          },
        },

        orderBy: {
          createdAt: 'desc',
        },

        skip,
        take: input.limit,
      }),

      this.prisma.application.count({
        where,
      }),
    ]);

    return {
      data,
      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }
}
