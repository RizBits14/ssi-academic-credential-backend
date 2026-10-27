import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  ApiProtectedEndpoint,
  ApiPublicEndpoint,
} from '../common/swagger/api-endpoint.decorator';
import { OrganizationType, UserRole } from '../generated/prisma/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { DidService } from './did.service';
import { ChangeDidKeyDto } from './dto/change-did-key.dto';

@ApiTags('did')
@Controller('dids')
export class DidController {
  constructor(
    private readonly didService: DidService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @ApiPublicEndpoint('Resolve a DID document')
  @Get(':did')
  async resolve(@Param('did') did: string) {
    const resolved = await this.didService.resolveDid(did);

    const verificationMethod = {
      id: resolved.verificationMethod.id,
      type: resolved.verificationMethod.type,
      controller: resolved.verificationMethod.controller,
      publicKeyMultibase: resolved.verificationMethod.publicKeyMultibase,
    };

    return {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/multikey/v1',
      ],
      id: resolved.id,
      verificationMethod: [verificationMethod],

      /**
       * The same Ed25519 key is currently authorized for:
       *
       * - authentication, which will support holder presentation proofs
       * - assertionMethod, which supports issuer credential proofs
       *
       * These are verification-method references rather than duplicated
       * embedded key objects.
       */
      authentication: [verificationMethod.id],
      assertionMethod: [verificationMethod.id],
    };
  }

  @ApiProtectedEndpoint('Rotate the current organization DID key', 201)
  @Post('organization/rotate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ISSUER_ADMIN, UserRole.VERIFIER_ADMIN)
  async rotateOrganization(@Req() request: AuthenticatedRequest) {
    const organizationId = await this.getOrganizationId(request);

    return this.didService.rotateForOrganization(
      organizationId,
      request.user.sub,
    );
  }

  @ApiProtectedEndpoint('Revoke a retired organization DID key', 201)
  @Post('organization/keys/:version/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ISSUER_ADMIN, UserRole.VERIFIER_ADMIN)
  async revokeOrganizationKey(
    @Req() request: AuthenticatedRequest,
    @Param('version', ParseIntPipe) version: number,
    @Body() dto: ChangeDidKeyDto,
  ) {
    const organizationId = await this.getOrganizationId(request);

    return this.didService.revokeHistoricalKeyForOrganization(
      organizationId,
      version,
      request.user.sub,
      dto?.reason,
    );
  }

  @ApiProtectedEndpoint(
    'Recover an organization DID from a compromised current key',
    201,
  )
  @Post('organization/recover')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ISSUER_ADMIN, UserRole.VERIFIER_ADMIN)
  async recoverOrganization(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangeDidKeyDto,
  ) {
    const organizationId = await this.getOrganizationId(request);

    return this.didService.recoverForOrganization(
      organizationId,
      request.user.sub,
      dto?.reason,
    );
  }

  @ApiProtectedEndpoint('Rotate the current holder DID key', 201)
  @Post('me/rotate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOLDER)
  rotateHolder(@Req() request: AuthenticatedRequest) {
    return this.didService.rotateForUser(request.user.sub);
  }

  @ApiProtectedEndpoint('Revoke a retired holder DID key', 201)
  @Post('me/keys/:version/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOLDER)
  revokeHolderKey(
    @Req() request: AuthenticatedRequest,
    @Param('version', ParseIntPipe) version: number,
    @Body() dto: ChangeDidKeyDto,
  ) {
    return this.didService.revokeHistoricalKeyForUser(
      request.user.sub,
      version,
      dto?.reason,
    );
  }

  @ApiProtectedEndpoint(
    'Recover a holder DID from a compromised current key',
    201,
  )
  @Post('me/recover')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOLDER)
  recoverHolder(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangeDidKeyDto,
  ) {
    return this.didService.recoverForUser(request.user.sub, dto?.reason);
  }

  private async getOrganizationId(
    request: AuthenticatedRequest,
  ): Promise<string> {
    let organizationType: OrganizationType;

    if (request.user.role === UserRole.ISSUER_ADMIN) {
      organizationType = OrganizationType.UNIVERSITY;
    } else if (request.user.role === UserRole.VERIFIER_ADMIN) {
      organizationType = OrganizationType.BANK;
    } else {
      throw new ForbiddenException(
        'User role cannot manage an organization DID',
      );
    }

    const membership =
      await this.organizationsService.findActiveMembershipForUser(
        request.user.sub,
        organizationType,
      );

    if (!membership) {
      throw new NotFoundException('Active organization membership not found');
    }

    return membership.organization.id;
  }
}
