import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const mockPrismaService = {
    $queryRawUnsafe: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  const mockRedisService = {
    ping: jest.fn<(...args: unknown[]) => Promise<string>>(),
  };

  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new HealthService(
      mockPrismaService as unknown as PrismaService,
      mockRedisService as unknown as RedisService,
    );
  });

  it('should report healthy dependencies', async () => {
    mockPrismaService.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);

    mockRedisService.ping.mockResolvedValue('PONG');

    const result = await service.check();

    expect(result.status).toBe('ok');

    expect(result.database).toBe('connected');

    expect(result.redis).toBe('connected');
  });

  it('should report degraded when Redis is unavailable', async () => {
    mockPrismaService.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);

    mockRedisService.ping.mockRejectedValue(new Error('Redis unavailable'));

    const result = await service.check();

    expect(result.status).toBe('degraded');

    expect(result.database).toBe('connected');

    expect(result.redis).toBe('disconnected');
  });

  it('should report degraded when database is unavailable', async () => {
    mockPrismaService.$queryRawUnsafe.mockRejectedValue(
      new Error('Database unavailable'),
    );

    mockRedisService.ping.mockResolvedValue('PONG');

    const result = await service.check();

    expect(result.status).toBe('degraded');

    expect(result.database).toBe('disconnected');

    expect(result.redis).toBe('connected');
  });
});
