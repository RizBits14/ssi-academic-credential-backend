import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { RawResponse } from '../common/decorators/raw-response.decorator';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @RawResponse()
  @Get()
  @ApiOperation({
    summary: 'Check API, PostgreSQL, and Redis health',
  })
  @ApiOkResponse({
    description: 'Current backend dependency health',
    schema: {
      example: {
        status: 'ok',
        database: 'connected',
        redis: 'connected',
        timestamp: '2026-09-16T12:00:00.000Z',
      },
    },
  })
  checkHealth() {
    return this.healthService.check();
  }

  @RawResponse()
  @Get('live')
  @ApiOperation({
    summary: 'Check whether the API process is alive',
  })
  @ApiOkResponse({
    description: 'API process is alive',
    schema: {
      example: {
        status: 'ok',
        timestamp: '2026-09-16T12:00:00.000Z',
      },
    },
  })
  checkLiveness() {
    return this.healthService.liveness();
  }

  @RawResponse()
  @Get('ready')
  @ApiOperation({
    summary:
      'Check whether the API is ready to serve dependency-backed traffic',
  })
  @ApiOkResponse({
    description: 'API and required dependencies are ready',
    schema: {
      example: {
        status: 'ok',
        database: 'connected',
        redis: 'connected',
        timestamp: '2026-09-16T12:00:00.000Z',
      },
    },
  })
  @ApiServiceUnavailableResponse({
    description: 'One or more required dependencies are unavailable',
    schema: {
      example: {
        status: 'degraded',
        database: 'connected',
        redis: 'disconnected',
        timestamp: '2026-09-16T12:00:00.000Z',
      },
    },
  })
  async checkReadiness(@Res({ passthrough: true }) response: Response) {
    const result = await this.healthService.check();

    if (result.status !== 'ok') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return result;
  }
}
