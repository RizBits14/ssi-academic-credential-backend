import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

type ConnectionStatus = 'connected' | 'disconnected';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check() {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    return {
      status:
        database === 'connected' && redis === 'connected' ? 'ok' : 'degraded',

      database,
      redis,

      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<ConnectionStatus> {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');

      return 'connected';
    } catch {
      return 'disconnected';
    }
  }

  private async checkRedis(): Promise<ConnectionStatus> {
    try {
      const response = await this.redis.ping();

      return response === 'PONG' ? 'connected' : 'disconnected';
    } catch {
      return 'disconnected';
    }
  }
}
