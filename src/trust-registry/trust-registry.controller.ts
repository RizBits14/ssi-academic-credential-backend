import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../generated/prisma/enums';
import { CreateTrustedIssuerDto } from './dto/create-trusted-issuer.dto';
import { TrustRegistryService } from './trust-registry.service';
import { ListTrustedIssuersDto } from './dto/list-trusted-issuers.dto';

@Controller('trust-registry/issuers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYSTEM_ADMIN)
export class TrustRegistryController {
  constructor(private readonly trustRegistryService: TrustRegistryService) {}

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

  @Get()
  async findAll(@Query() query: ListTrustedIssuersDto) {
    return this.trustRegistryService.findAllPaginated({
      page: query.page,
      limit: query.limit,
      status: query.status,
      organizationId: query.organizationId,
    });
  }

  @Get(':did')
  async findByDid(@Param('did') did: string) {
    return this.trustRegistryService.findByDid(did);
  }

  @Patch(':id/suspend')
  async suspend(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.trustRegistryService.suspend(id, request.user.sub);
  }
}
