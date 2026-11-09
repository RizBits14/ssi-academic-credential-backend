import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApiProtectedEndpoint } from '../common/swagger/api-endpoint.decorator';
import { UserRole } from '../generated/prisma/enums';
import { ListWalletCredentialsDto } from './dto/list-wallet-credentials.dto';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@Controller('wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.HOLDER)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @ApiProtectedEndpoint('List holder credentials with pagination and filters')
  @Get('credentials')
  async findAll(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListWalletCredentialsDto,
  ) {
    const result = await this.walletService.findByHolderPaginated({
      holderId: request.user.sub,
      page: query.page,
      limit: query.limit,
      status: query.status,
      issuedFrom: query.issuedFrom,
      issuedTo: query.issuedTo,
    });

    return {
      data: result.data.map((walletCredential) => ({
        id: walletCredential.id,
        credentialId: walletCredential.credentialId,
        createdAt: walletCredential.createdAt,
        updatedAt: walletCredential.updatedAt,
        credential: {
          id: walletCredential.credential.id,
          vcId: walletCredential.credential.vcId,
          issuerDid: walletCredential.credential.issuerDid,
          holderDid: walletCredential.credential.holderDid,
          status: walletCredential.credential.status,
          issuedAt: walletCredential.credential.issuedAt,
          expiresAt: walletCredential.credential.expiresAt,
          issuerOrganization: {
            id: walletCredential.credential.issuerOrganization.id,
            name: walletCredential.credential.issuerOrganization.name,
          },
          schema: {
            id: walletCredential.credential.schema.id,
            name: walletCredential.credential.schema.name,
            version: walletCredential.credential.schema.version,
          },
        },
      })),
      meta: result.meta,
    };
  }

  @ApiProtectedEndpoint('Decrypt and view a credential owned by the holder')
  @Get('credentials/:id')
  async findOne(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const credential = await this.walletService.decryptCredentialForHolder(
      request.user.sub,
      id,
    );

    return {
      walletCredentialId: id,
      credential,
    };
  }

  @ApiProtectedEndpoint('List pending credential verification requests')
  @Get('requests')
  async findPendingRequests(
    @Req() request: AuthenticatedRequest,
    @Query() query: PaginationQueryDto,
  ) {
    return this.walletService.findPendingRequestsPaginated({
      holderId: request.user.sub,
      page: query.page,
      limit: query.limit,
    });
  }
}
