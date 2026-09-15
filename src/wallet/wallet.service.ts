import { Injectable, NotFoundException } from '@nestjs/common';

import { EncryptionService } from '../crypto/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { VerificationRequestStatus } from '../generated/prisma/enums';

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

  async findPendingRequests(holderId: string) {
    const now = new Date();

    await this.prisma.verificationRequest.updateMany({
      where: {
        holderId,
        status: VerificationRequestStatus.PENDING,
        expiresAt: {
          lte: now,
        },
      },
      data: {
        status: VerificationRequestStatus.EXPIRED,
      },
    });

    const requests = await this.prisma.verificationRequest.findMany({
      where: {
        holderId,
        status: VerificationRequestStatus.PENDING,
        expiresAt: {
          gt: now,
        },
      },
      include: {
        application: {
          include: {
            job: {
              include: {
                bank: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return requests.map((request) => ({
      requestId: request.id,
      bank: request.application.job.bank.name,
      job: request.application.job.title,
      requestedClaims: request.requestedClaims,
      expiresAt: request.expiresAt,
    }));
  }
}
