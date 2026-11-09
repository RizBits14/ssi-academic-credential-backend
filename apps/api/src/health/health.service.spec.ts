import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const mockPrismaService = {
    $queryRaw: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
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

  it('should report the API process as alive without checking dependencies', () => {
    const result = service.liveness();

    expect(result.status).toBe('ok');
    expect(result.timestamp).toEqual(expect.any(String));
    expect(mockPrismaService.$queryRaw).not.toHaveBeenCalled();
    expect(mockRedisService.ping).not.toHaveBeenCalled();
  });

  it('should report healthy dependencies', async () => {
    mockPrismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    mockRedisService.ping.mockResolvedValue('PONG');

    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('connected');
    expect(result.redis).toBe('connected');
    expect(result.timestamp).toEqual(expect.any(String));
  });

  it('should report degraded when Redis is unavailable', async () => {
    mockPrismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    mockRedisService.ping.mockRejectedValue(new Error('Redis unavailable'));

    const result = await service.check();

    expect(result.status).toBe('degraded');
    expect(result.database).toBe('connected');
    expect(result.redis).toBe('disconnected');
  });

  it('should report degraded when Redis responds unexpectedly', async () => {
    mockPrismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    mockRedisService.ping.mockResolvedValue('NOT_PONG');

    const result = await service.check();

    expect(result.status).toBe('degraded');
    expect(result.database).toBe('connected');
    expect(result.redis).toBe('disconnected');
  });

  it('should report degraded when database is unavailable', async () => {
    mockPrismaService.$queryRaw.mockRejectedValue(
      new Error('Database unavailable'),
    );
    mockRedisService.ping.mockResolvedValue('PONG');

    const result = await service.check();

    expect(result.status).toBe('degraded');
    expect(result.database).toBe('disconnected');
    expect(result.redis).toBe('connected');
  });
});
