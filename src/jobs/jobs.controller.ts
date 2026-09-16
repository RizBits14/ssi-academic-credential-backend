import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApiProtectedEndpoint } from '../common/swagger/api-endpoint.decorator';
import { OrganizationType, UserRole } from '../generated/prisma/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsDto } from './dto/list-jobs.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @ApiProtectedEndpoint('Create a recruitment job', 201)
  @Post()
  @Roles(UserRole.VERIFIER_ADMIN)
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateJobDto,
  ) {
    const bankId = await this.getBankId(request.user.sub);

    return this.jobsService.create({
      bankId,
      title: dto.title,
      description: dto.description,
      requiredClaims: dto.requiredClaims,
    });
  }

  @ApiProtectedEndpoint('List recruitment jobs with pagination and filters')
  @Get()
  async findAll(@Query() query: ListJobsDto) {
    return this.jobsService.findAllPaginated({
      page: query.page,
      limit: query.limit,
      status: query.status,
      bankId: query.bankId,
    });
  }

  @ApiProtectedEndpoint('Update a recruitment job')
  @Patch(':id')
  @Roles(UserRole.VERIFIER_ADMIN)
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobDto,
  ) {
    const bankId = await this.getBankId(request.user.sub);

    return this.jobsService.update(id, bankId, dto);
  }

  @ApiProtectedEndpoint('Get a recruitment job')
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobsService.findOne(id);
  }

  private async getBankId(userId: string): Promise<string> {
    const membership =
      await this.organizationsService.findMembershipForUser(userId);

    if (!membership || membership.organization.type !== OrganizationType.BANK) {
      throw new NotFoundException('Bank membership not found');
    }

    return membership.organization.id;
  }
}
