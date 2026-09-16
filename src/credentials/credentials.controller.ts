import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrganizationType, UserRole } from '../generated/prisma/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { CredentialIssuanceService } from './credential-issuance.service';
import { CredentialStatusService } from './credential-status.service';
import { ChangeCredentialStatusDto } from './dto/change-credential-status.dto';
import { IssueCredentialDto } from './dto/issue-credential.dto';

@Controller('credentials')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ISSUER_ADMIN)
export class CredentialsController {
  constructor(
    private readonly credentialIssuanceService: CredentialIssuanceService,
    private readonly credentialStatusService: CredentialStatusService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Post('issue')
  async issue(
    @Req() request: AuthenticatedRequest,
    @Body() dto: IssueCredentialDto,
  ) {
    const universityId = await this.getUniversityId(request.user.sub);

    return this.credentialIssuanceService.issue({
      issuerOrganizationId: universityId,
      academicRecordId: dto.academicRecordId,
      schemaId: dto.schemaId,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      actorId: request.user.sub,
    });
  }

  @Post(':id/suspend')
  async suspend(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeCredentialStatusDto,
  ) {
    const universityId = await this.getUniversityId(request.user.sub);

    return this.credentialStatusService.suspend({
      credentialId: id,
      issuerOrganizationId: universityId,
      changedBy: request.user.sub,
      reason: dto.reason,
    });
  }

  @Post(':id/revoke')
  async revoke(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeCredentialStatusDto,
  ) {
    const universityId = await this.getUniversityId(request.user.sub);

    return this.credentialStatusService.revoke({
      credentialId: id,
      issuerOrganizationId: universityId,
      changedBy: request.user.sub,
      reason: dto.reason,
    });
  }

  @Post(':id/reactivate')
  async reactivate(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const universityId = await this.getUniversityId(request.user.sub);

    return this.credentialStatusService.reactivate({
      credentialId: id,
      issuerOrganizationId: universityId,
      changedBy: request.user.sub,
    });
  }

  @Get(':id/status')
  async getStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.credentialStatusService.getStatus(id);
  }

  @Get(':id/status-history')
  async getHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.credentialStatusService.getHistory(id);
  }

  private async getUniversityId(userId: string): Promise<string> {
    const membership =
      await this.organizationsService.findMembershipForUser(userId);

    if (
      !membership ||
      membership.organization.type !== OrganizationType.UNIVERSITY
    ) {
      throw new NotFoundException('University membership not found');
    }

    return membership.organization.id;
  }
}
