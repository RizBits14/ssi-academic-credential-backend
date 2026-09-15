import { Injectable, NotFoundException } from '@nestjs/common';

import { EncryptionService } from '../crypto/encryption.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async findByHolder(holderId: string) {
    return this.prisma.walletCredential.findMany({
      where: {
        holderId,
      },
      include: {
        credential: {
          include: {
            issuerOrganization: true,
            schema: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOneForHolder(holderId: string, walletCredentialId: string) {
    const walletCredential = await this.prisma.walletCredential.findFirst({
      where: {
        id: walletCredentialId,
        holderId,
      },
      include: {
        credential: {
          include: {
            issuerOrganization: true,
            schema: true,
          },
        },
      },
    });

    if (!walletCredential) {
      throw new NotFoundException('Wallet credential not found');
    }

    return walletCredential;
  }

  async decryptCredentialForHolder(
    holderId: string,
    walletCredentialId: string,
  ) {
    const walletCredential = await this.findOneForHolder(
      holderId,
      walletCredentialId,
    );

    const plaintext = this.encryptionService.decrypt({
      ciphertext: walletCredential.ciphertext,
      iv: walletCredential.iv,
      authTag: walletCredential.authTag,
    });

    return JSON.parse(plaintext) as Record<string, unknown>;
  }
}
