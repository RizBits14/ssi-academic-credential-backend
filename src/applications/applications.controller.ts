import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrganizationType, UserRole } from '../generated/prisma/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ListApplicationsDto } from './dto/list-applications.dto';

@Controller('applications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    private readonly organizationsService: OrganizationsService,
  ) {}

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

  @Get(':id')
  @Roles(UserRole.HOLDER, UserRole.VERIFIER_ADMIN)
  async findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const application = await this.applicationsService.findOne(id);

    if (request.user.role === UserRole.HOLDER) {
      if (application.holderId !== request.user.sub) {
        throw new ForbiddenException('You cannot access this application');
      }

      return application;
    }

    if (request.user.role === UserRole.VERIFIER_ADMIN) {
      const bankId = await this.getBankId(request.user.sub);

      if (application.job.bankId !== bankId) {
        throw new ForbiddenException('You cannot access this application');
      }

      return application;
    }

    throw new ForbiddenException('You cannot access this application');
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
