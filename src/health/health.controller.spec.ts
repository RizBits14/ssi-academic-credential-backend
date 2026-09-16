import { describe, expect, it, jest } from '@jest/globals';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  const mockHealthService = {
    check: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  const controller = new HealthController(
    mockHealthService as unknown as HealthService,
  );

  it('should return backend health', async () => {
    const health = {
      status: 'ok',
      database: 'connected',
      redis: 'connected',
      timestamp: '2026-09-16T12:00:00.000Z',
    };

    mockHealthService.check.mockResolvedValue(health);

    const result = await controller.checkHealth();

    expect(result).toEqual(health);

    expect(mockHealthService.check).toHaveBeenCalledTimes(1);
  });
});
