import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../generated/prisma/enums';
import { CreateTrustedIssuerDto } from './dto/create-trusted-issuer.dto';
import { TrustRegistryService } from './trust-registry.service';

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
  async findAll() {
    return this.trustRegistryService.findAll();
  }

  @Get(':did')
  async findByDid(@Param('did') did: string) {
    return this.trustRegistryService.findByDid(did);
  }
}
