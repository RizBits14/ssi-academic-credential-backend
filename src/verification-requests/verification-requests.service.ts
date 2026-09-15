import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import {
  EducationVerificationStatus,
  VerificationRequestStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface CreateVerificationRequestInput {
  applicationId: string;
  verifierId: string;
  bankId: string;
  requestedClaims: string[];
}

@Injectable()
export class VerificationRequestsService {
  private readonly ttlSeconds = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async create(input: CreateVerificationRequestInput) {
    const application = await this.prisma.application.findUnique({
      where: {
        id: input.applicationId,
      },
      include: {
        job: true,
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.job.bankId !== input.bankId) {
      throw new ForbiddenException('Application does not belong to your bank');
    }

    this.validateRequestedClaims(
      input.requestedClaims,
      application.job.requiredClaims,
    );

    const nonce = randomBytes(32).toString('hex');

    const nonceHash = createHash('sha256').update(nonce).digest('hex');

    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    const request = await this.prisma.verificationRequest.create({
      data: {
        applicationId: input.applicationId,
        verifierId: input.verifierId,
        holderId: application.holderId,
        requestedClaims: input.requestedClaims,
        nonceHash,
        status: VerificationRequestStatus.PENDING,
        expiresAt,
      },
    });

    await this.redis.setJson(
      `verification-request:${request.id}`,
      {
        applicationId: input.applicationId,
        holderId: application.holderId,
        bankId: input.bankId,
        nonce,
        requestedClaims: input.requestedClaims,
      },
      this.ttlSeconds,
    );

    await this.prisma.application.update({
      where: {
        id: input.applicationId,
      },
      data: {
        educationVerificationStatus: EducationVerificationStatus.PENDING,
      },
    });

    return {
      requestId: request.id,
      nonce,
      expiresAt: request.expiresAt,
      status: request.status,
      requestedClaims: request.requestedClaims,
    };
  }

  private validateRequestedClaims(
    requestedClaims: string[],
    requiredClaims: unknown,
  ): void {
    if (requestedClaims.length === 0) {
      throw new BadRequestException('At least one claim must be requested');
    }

    const normalized = requestedClaims.map((claim) => claim.trim());

    if (normalized.some((claim) => claim.length === 0)) {
      throw new BadRequestException('Requested claims cannot be empty');
    }

    if (new Set(normalized).size !== normalized.length) {
      throw new BadRequestException('Requested claims must be unique');
    }

    if (!Array.isArray(requiredClaims)) {
      throw new BadRequestException('Job required claims are invalid');
    }

    const allowedClaims = requiredClaims.filter(
      (claim): claim is string => typeof claim === 'string',
    );

    const unauthorizedClaims = normalized.filter(
      (claim) => !allowedClaims.includes(claim),
    );

    if (unauthorizedClaims.length > 0) {
      throw new BadRequestException(
        'Requested claims must be part of the job required claims',
      );
    }
  }

  async findOne(id: string) {
    const request = await this.prisma.verificationRequest.findUnique({
      where: {
        id,
      },
      include: {
        application: {
          include: {
            job: {
              include: {
                bank: true,
              },
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Verification request not found');
    }

    return request;
  }
}
