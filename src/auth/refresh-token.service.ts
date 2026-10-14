import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export type ConsumeTokenResult = 'consumed' | 'reused' | 'invalid';

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

  async consumeToken(
    token: string,
    userId: string,
    familyId: string,
  ): Promise<ConsumeTokenResult> {
    const tokenHash = this.hashToken(token);
    const now = new Date();

    const consumed = await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        userId,
        familyId,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
        family: {
          revokedAt: null,
        },
      },
      data: {
        revokedAt: now,
      },
    });

    if (consumed.count === 1) {
      return 'consumed';
    }

    const existingToken = await this.prisma.refreshToken.findUnique({
      where: {
        tokenHash,
      },
      select: {
        userId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
        family: {
          select: {
            revokedAt: true,
          },
        },
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

    if (existingToken.family.revokedAt) {
      return 'invalid';
    }

    if (existingToken.revokedAt) {
      await this.revokeFamily(familyId, userId);
      return 'reused';
    }

    return 'invalid';
  }

  async revokeFamily(familyId: string, userId: string): Promise<void> {
    const revokedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.refreshTokenFamily.updateMany({
        where: {
          id: familyId,
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: {
          familyId,
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt,
        },
      }),
    ]);
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
