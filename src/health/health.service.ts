import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

type ConnectionStatus = 'connected' | 'disconnected';
type ReadinessStatus = 'ok' | 'degraded';

export interface LivenessResult {
  status: 'ok';
  timestamp: string;
}

export interface ReadinessResult {
  status: ReadinessStatus;
  database: ConnectionStatus;
  redis: ConnectionStatus;
  timestamp: string;
}

const DEPENDENCY_CHECK_TIMEOUT_MS = 5_000;

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  liveness(): LivenessResult {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  async check(): Promise<ReadinessResult> {
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
      await this.withTimeout(this.prisma.$queryRaw`SELECT 1`);

      return 'connected';
    } catch {
      return 'disconnected';
    }
  }

  private async checkRedis(): Promise<ConnectionStatus> {
    try {
      const response = await this.withTimeout(this.redis.ping());

      return response === 'PONG' ? 'connected' : 'disconnected';
    } catch {
      return 'disconnected';
    }
  }

  private async withTimeout<T>(operation: PromiseLike<T>): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error('Dependency health check timed out'));
      }, DEPENDENCY_CHECK_TIMEOUT_MS);
    });

    try {
      return await Promise.race([operation, timeoutPromise]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}
