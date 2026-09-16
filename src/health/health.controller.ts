import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

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
}
