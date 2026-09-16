import {
  Body,
  Controller,
  Get,
  NotFoundException,
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
import { CredentialSchemasService } from './credential-schemas.service';
import { CreateCredentialSchemaDto } from './dto/create-credential-schema.dto';
import { ListCredentialSchemasDto } from './dto/list-credential-schemas.dto';

@ApiTags('credential-schemas')
@Controller('credential-schemas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ISSUER_ADMIN)
export class CredentialSchemasController {
  constructor(
    private readonly credentialSchemasService: CredentialSchemasService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @ApiProtectedEndpoint('Create a credential schema', 201)
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

  @ApiProtectedEndpoint('List credential schemas with pagination and filters')
  @Get()
  async findAll(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListCredentialSchemasDto,
  ) {
    const organizationId = await this.getUniversityId(request.user.sub);

    return this.credentialSchemasService.findByOrganizationPaginated({
      organizationId,
      page: query.page,
      limit: query.limit,
      status: query.status,
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
