import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RefreshTokenService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async storeToken(userId: string, token: string, expiresAt: Date) {
    return this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(token),
        expiresAt,
      },
    });
  }

  async consumeToken(token: string, userId: string): Promise<boolean> {
    const tokenHash = this.hashToken(token);

    const result = await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return result.count === 1;
  }
}
