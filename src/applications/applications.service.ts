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
}
