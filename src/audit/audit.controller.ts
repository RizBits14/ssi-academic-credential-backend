import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrganizationType, UserRole } from '../generated/prisma/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditService } from './audit.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

@ApiTags('audit')
@ApiBearerAuth('access-token')
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Get()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.ISSUER_ADMIN, UserRole.VERIFIER_ADMIN)
  @ApiOperation({
    summary: 'List authorized audit logs',
  })
  async findAll(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListAuditLogsDto,
  ) {
    let organizationId: string | undefined;

    if (request.user.role !== UserRole.SYSTEM_ADMIN) {
      const membership = await this.organizationsService.findMembershipForUser(
        request.user.sub,
      );

      if (!membership) {
        throw new ForbiddenException('Organization membership required');
      }

      if (
        request.user.role === UserRole.ISSUER_ADMIN &&
        membership.organization.type !== OrganizationType.UNIVERSITY
      ) {
        throw new ForbiddenException('University membership required');
      }

      if (
        request.user.role === UserRole.VERIFIER_ADMIN &&
        membership.organization.type !== OrganizationType.BANK
      ) {
        throw new ForbiddenException('Bank membership required');
      }

      organizationId = membership.organization.id;
    }

    return this.auditService.findAll({
      page: query.page,
      limit: query.limit,
      action: query.action,
      organizationId,
    });
  }
}
