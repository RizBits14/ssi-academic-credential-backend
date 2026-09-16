import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

import { VerificationRequestStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface VerificationSession {
  applicationId: string;
  holderId: string;
  bankId: string;
  nonce: string;
  requestedClaims: string[];
}

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async validateRequestContext(presentationId: string) {
    const presentation = await this.prisma.presentation.findUnique({
      where: {
        id: presentationId,
      },
      include: {
        request: {
          include: {
            application: true,
          },
        },
        credential: true,
      },
    });

    if (!presentation) {
      throw new NotFoundException('Presentation not found');
    }

    const request = presentation.request;

    if (
      request.status === VerificationRequestStatus.VERIFIED ||
      request.status === VerificationRequestStatus.FAILED ||
      request.status === VerificationRequestStatus.REJECTED
    ) {
      throw new ConflictException(
        'Verification request has already been consumed',
      );
    }

    if (request.status !== VerificationRequestStatus.APPROVED) {
      throw new ConflictException('Verification request is not approved');
    }

    if (request.expiresAt.getTime() <= Date.now()) {
      await this.prisma.verificationRequest.update({
        where: {
          id: request.id,
        },
        data: {
          status: VerificationRequestStatus.EXPIRED,
        },
      });

      await this.redis.delete(`verification-request:${request.id}`);

      throw new BadRequestException('Verification request has expired');
    }

    const session = await this.redis.getJson<VerificationSession>(
      `verification-request:${request.id}`,
    );

    if (!session) {
      throw new BadRequestException(
        'Verification session not found or expired',
      );
    }

    const nonceHash = createHash('sha256')
      .update(presentation.nonce)
      .digest('hex');

    const nonceValid =
      session.nonce === presentation.nonce && nonceHash === request.nonceHash;

    if (!nonceValid) {
      throw new BadRequestException(
        'Presentation nonce does not match verification request',
      );
    }

    const holderMatches =
      request.holderId === presentation.holderId &&
      request.application.holderId === presentation.holderId &&
      session.holderId === presentation.holderId;

    if (!holderMatches) {
      throw new BadRequestException(
        'Holder does not match verification request',
      );
    }

    if (session.applicationId !== request.applicationId) {
      throw new BadRequestException(
        'Verification session application mismatch',
      );
    }

    return {
      presentation,
      request,
      session,
      checks: {
        requestValid: true,
        nonceValid: true,
        holderMatches: true,
      },
    };
  }
}
