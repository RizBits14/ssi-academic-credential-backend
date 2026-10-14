import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
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
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ListApplicationsDto } from './dto/list-applications.dto';

@ApiTags('applications')
@Controller('applications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @ApiProtectedEndpoint('Submit a job application', 201)
  @Post()
  @Roles(UserRole.HOLDER)
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateApplicationDto,
  ) {
    return this.applicationsService.create({
      jobId: dto.jobId,
      holderId: request.user.sub,
    });
  }

  @ApiProtectedEndpoint(
    'List the current holder applications with pagination and filters',
  )
  @Get('me')
  @Roles(UserRole.HOLDER)
  async findMine(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListApplicationsDto,
  ) {
    return this.applicationsService.findByHolderPaginated({
      holderId: request.user.sub,
      page: query.page,
      limit: query.limit,
      status: query.status,
      educationVerificationStatus: query.educationVerificationStatus,
      jobId: query.jobId,
    });
  }

  @ApiProtectedEndpoint('Get an authorized application')
  @Get(':id')
  @Roles(UserRole.HOLDER, UserRole.VERIFIER_ADMIN)
  async findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (request.user.role === UserRole.HOLDER) {
      return this.applicationsService.findOneForHolder(id, request.user.sub);
    }

    const bankId = await this.getBankId(request.user.sub);

    return this.applicationsService.findOneForBank(id, bankId);
  }

  private async getBankId(userId: string): Promise<string> {
    const membership =
      await this.organizationsService.findActiveMembershipForUser(
        userId,
        OrganizationType.BANK,
      );

    if (!membership) {
      throw new NotFoundException('Active bank membership not found');
    }

    return membership.organization.id;
  }
}
