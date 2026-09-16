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
import { CredentialIssuanceService } from './credential-issuance.service';
import { CredentialStatusService } from './credential-status.service';
import { ChangeCredentialStatusDto } from './dto/change-credential-status.dto';
import { IssueCredentialDto } from './dto/issue-credential.dto';
import { ListIssuedCredentialsDto } from './dto/list-issued-credentials.dto';

@ApiTags('credentials')
@Controller('credentials')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ISSUER_ADMIN)
export class CredentialsController {
  constructor(
    private readonly credentialIssuanceService: CredentialIssuanceService,
    private readonly credentialStatusService: CredentialStatusService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @ApiProtectedEndpoint('Issue an academic credential', 201)
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

  @ApiProtectedEndpoint('List issued credentials with pagination and filters')
  @Get('issued')
  async findIssued(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListIssuedCredentialsDto,
  ) {
    const universityId = await this.getUniversityId(request.user.sub);

    return this.credentialIssuanceService.findIssued({
      issuerOrganizationId: universityId,
      page: query.page,
      limit: query.limit,
      status: query.status,
      holderId: query.holderId,
      issuedFrom: query.issuedFrom,
      issuedTo: query.issuedTo,
    });
  }

  @ApiProtectedEndpoint('Suspend an active credential', 201)
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

  @ApiProtectedEndpoint('Revoke a credential', 201)
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

  @ApiProtectedEndpoint('Reactivate a suspended credential', 201)
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

  @ApiProtectedEndpoint('Get current credential status')
  @Get(':id/status')
  async getStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.credentialStatusService.getStatus(id);
  }

  @ApiProtectedEndpoint('Get credential status history')
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
