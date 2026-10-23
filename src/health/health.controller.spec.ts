import { HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Response } from 'express';

import { HealthController } from './health.controller';
import {
  HealthService,
  type LivenessResult,
  type ReadinessResult,
} from './health.service';

describe('HealthController', () => {
  const mockHealthService = {
    check: jest.fn<() => Promise<ReadinessResult>>(),
    liveness: jest.fn<() => LivenessResult>(),
  };

  let controller: HealthController;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new HealthController(
      mockHealthService as unknown as HealthService,
    );
  });

  it('should return the legacy dependency health response', async () => {
    const result: ReadinessResult = {
      status: 'ok',
      database: 'connected',
      redis: 'connected',
      timestamp: new Date().toISOString(),
    };

    mockHealthService.check.mockResolvedValue(result);

    await expect(controller.checkHealth()).resolves.toEqual(result);
  });

  it('should return liveness without checking dependencies', () => {
    const result: LivenessResult = {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };

    mockHealthService.liveness.mockReturnValue(result);

    expect(controller.checkLiveness()).toEqual(result);
    expect(mockHealthService.check).not.toHaveBeenCalled();
  });

  it('should keep readiness at HTTP 200 when dependencies are healthy', async () => {
    const result: ReadinessResult = {
      status: 'ok',
      database: 'connected',
      redis: 'connected',
      timestamp: new Date().toISOString(),
    };

    const status = jest.fn<(code: number) => unknown>();
    const response = { status } as unknown as Response;

    mockHealthService.check.mockResolvedValue(result);

    await expect(controller.checkReadiness(response)).resolves.toEqual(result);
    expect(status).not.toHaveBeenCalled();
  });

  it('should set readiness to HTTP 503 when a required dependency is unavailable', async () => {
    const result: ReadinessResult = {
      status: 'degraded',
      database: 'connected',
      redis: 'disconnected',
      timestamp: new Date().toISOString(),
    };

    const status = jest.fn<(code: number) => unknown>();
    const response = { status } as unknown as Response;

    mockHealthService.check.mockResolvedValue(result);

    await expect(controller.checkReadiness(response)).resolves.toEqual(result);
    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
