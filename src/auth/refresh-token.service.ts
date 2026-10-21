import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';

export type RotateTokenResult = 'rotated' | 'reused' | 'invalid';

@Injectable()
export class RefreshTokenService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createFamily(userId: string): Promise<string> {
    const family = await this.prisma.refreshTokenFamily.create({
      data: {
        userId,
      },
      select: {
        id: true,
      },
    });

    return family.id;
  }

  async storeToken(
    userId: string,
    familyId: string,
    token: string,
    expiresAt: Date,
  ) {
    return this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: this.hashToken(token),
        expiresAt,
      },
    });
  }

  async rotateToken(
    currentToken: string,
    userId: string,
    familyId: string,
    nextToken: string,
    nextExpiresAt: Date,
  ): Promise<RotateTokenResult> {
    const currentTokenHash = this.hashToken(currentToken);
    const nextTokenHash = this.hashToken(nextToken);
    const now = new Date();

    return this.prisma.$transaction(async (transaction) => {
      // This no-op update intentionally takes a row-level write lock on the
      // active family. Family revocation uses the same row first, preventing
      // a child token from being inserted after the family has been revoked.
      const activeFamily = await transaction.refreshTokenFamily.updateMany({
        where: {
          id: familyId,
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: null,
        },
      });

      if (activeFamily.count !== 1) {
        return 'invalid';
      }

      const consumed = await transaction.refreshToken.updateMany({
        where: {
          tokenHash: currentTokenHash,
          userId,
          familyId,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          revokedAt: now,
        },
      });

      if (consumed.count === 1) {
        await transaction.refreshToken.create({
          data: {
            userId,
            familyId,
            tokenHash: nextTokenHash,
            expiresAt: nextExpiresAt,
          },
        });

        return 'rotated';
      }

      const existingToken = await transaction.refreshToken.findUnique({
        where: {
          tokenHash: currentTokenHash,
        },
        select: {
          userId: true,
          familyId: true,
          expiresAt: true,
          revokedAt: true,
        },
      });

      if (
        !existingToken ||
        existingToken.userId !== userId ||
        existingToken.familyId !== familyId ||
        existingToken.expiresAt <= now
      ) {
        return 'invalid';
      }

      if (!existingToken.revokedAt) {
        return 'invalid';
      }

      const reusedAt = new Date();

      await transaction.refreshTokenFamily.updateMany({
        where: {
          id: familyId,
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: reusedAt,
        },
      });

      await transaction.refreshToken.updateMany({
        where: {
          familyId,
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: reusedAt,
        },
      });

      return 'reused';
    });
  }

  async revokeFamily(familyId: string, userId: string): Promise<void> {
    const revokedAt = new Date();

    await this.prisma.$transaction(async (transaction) => {
      const familyTransition = await transaction.refreshTokenFamily.updateMany({
        where: {
          id: familyId,
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt,
        },
      });

      if (familyTransition.count !== 1) {
        return;
      }

      await transaction.refreshToken.updateMany({
        where: {
          familyId,
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt,
        },
      });
    });
  }

  async revokeToken(token: string, userId: string): Promise<void> {
    const tokenHash = this.hashToken(token);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: {
        tokenHash,
      },
      select: {
        userId: true,
        familyId: true,
      },
    });

    if (!storedToken || storedToken.userId !== userId) {
      return;
    }

    await this.revokeFamily(storedToken.familyId, userId);
  }
}
