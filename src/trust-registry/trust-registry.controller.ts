import {
  Body,
  Controller,
  Get,
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
import { UserRole } from '../generated/prisma/enums';
import { CreateTrustedIssuerDto } from './dto/create-trusted-issuer.dto';
import { ListTrustedIssuersDto } from './dto/list-trusted-issuers.dto';
import { TrustRegistryService } from './trust-registry.service';

@ApiTags('trust-registry')
@Controller('trust-registry/issuers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYSTEM_ADMIN)
export class TrustRegistryController {
  constructor(private readonly trustRegistryService: TrustRegistryService) {}

  @ApiProtectedEndpoint('Add a university issuer to the trust registry', 201)
  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateTrustedIssuerDto,
  ) {
    return this.trustRegistryService.create({
      organizationId: dto.organizationId,
      issuerDid: dto.issuerDid,
      approvedBy: request.user.sub,
    });
  }

  @ApiProtectedEndpoint('List trusted issuers with pagination and filters')
  @Get()
  async findAll(@Query() query: ListTrustedIssuersDto) {
    return this.trustRegistryService.findAllPaginated({
      page: query.page,
      limit: query.limit,
      status: query.status,
      organizationId: query.organizationId,
    });
  }

  @ApiProtectedEndpoint('Resolve trust-registry information by issuer DID')
  @Get(':did')
  async findByDid(@Param('did') did: string) {
    return this.trustRegistryService.findByDid(did);
  }

  @ApiProtectedEndpoint('Suspend a trusted issuer')
  @Patch(':id/suspend')
  async suspend(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.trustRegistryService.suspend(id, request.user.sub);
  }
}
