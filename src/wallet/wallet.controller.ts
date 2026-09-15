import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../generated/prisma/enums';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.HOLDER)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('credentials')
  async findAll(@Req() request: AuthenticatedRequest) {
    const walletCredentials = await this.walletService.findByHolder(
      request.user.sub,
    );

    return walletCredentials.map((walletCredential) => ({
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
    }));
  }

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

  @Get('requests')
  async findPendingRequests(@Req() request: AuthenticatedRequest) {
    return this.walletService.findPendingRequests(request.user.sub);
  }
}
