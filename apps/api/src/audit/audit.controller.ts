import {
  Controller,
  ForbiddenException,
  Get,
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
import { AuditService } from './audit.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

@ApiTags('audit')
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @ApiProtectedEndpoint(
    'List authorized audit logs with pagination and filters',
  )
  @Get()
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.ISSUER_ADMIN, UserRole.VERIFIER_ADMIN)
  async findAll(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListAuditLogsDto,
  ) {
    let organizationId: string | undefined;

    if (request.user.role === UserRole.ISSUER_ADMIN) {
      organizationId = await this.getOrganizationId(
        request.user.sub,
        OrganizationType.UNIVERSITY,
        'University membership required',
      );
    }

    if (request.user.role === UserRole.VERIFIER_ADMIN) {
      organizationId = await this.getOrganizationId(
        request.user.sub,
        OrganizationType.BANK,
        'Bank membership required',
      );
    }

    return this.auditService.findAll({
      page: query.page,
      limit: query.limit,
      action: query.action,
      organizationId,
    });
  }

  private async getOrganizationId(
    userId: string,
    organizationType: OrganizationType,
    errorMessage: string,
  ): Promise<string> {
    const membership =
      await this.organizationsService.findActiveMembershipForUser(
        userId,
        organizationType,
      );

    if (!membership) {
      throw new ForbiddenException(errorMessage);
    }

    return membership.organization.id;
  }
}
