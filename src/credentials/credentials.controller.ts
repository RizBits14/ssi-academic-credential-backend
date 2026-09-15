import {
  Body,
  Controller,
  NotFoundException,
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
import { IssueCredentialDto } from './dto/issue-credential.dto';

@Controller('credentials')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ISSUER_ADMIN)
export class CredentialsController {
  constructor(
    private readonly credentialIssuanceService: CredentialIssuanceService,
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
    });
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
