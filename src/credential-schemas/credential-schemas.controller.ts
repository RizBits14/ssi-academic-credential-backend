import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrganizationType, UserRole } from '../generated/prisma/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { CredentialSchemasService } from './credential-schemas.service';
import { CreateCredentialSchemaDto } from './dto/create-credential-schema.dto';

@Controller('credential-schemas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ISSUER_ADMIN)
export class CredentialSchemasController {
  constructor(
    private readonly credentialSchemasService: CredentialSchemasService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateCredentialSchemaDto,
  ) {
    const organizationId = await this.getUniversityId(request.user.sub);

    return this.credentialSchemasService.create({
      organizationId,
      name: dto.name,
      version: dto.version,
      description: dto.description,
      schemaJson: dto.schemaJson,
    });
  }

  @Get()
  async findAll(@Req() request: AuthenticatedRequest) {
    const organizationId = await this.getUniversityId(request.user.sub);

    return this.credentialSchemasService.findByOrganization(organizationId);
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
