import { Injectable, NotFoundException } from '@nestjs/common';

import { EncryptionService } from '../crypto/encryption.service';
import { VerificationRequestStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { CredentialStatus } from '../generated/prisma/enums';
import { createPaginationMeta } from '../common/utils/pagination.util';

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

    const credential = JSON.parse(plaintext) as Record<string, unknown>;

    await this.prisma.auditLog.create({
      data: {
        actorId: holderId,
        organizationId: walletCredential.credential.issuerOrganizationId,
        action: 'CREDENTIAL_VIEWED',
        resourceType: 'Credential',
        resourceId: walletCredential.credential.id,
        metadata: {
          walletCredentialId: walletCredential.id,
        },
      },
    });

    return credential;
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

  async findByHolderPaginated(input: {
    holderId: string;
    page: number;
    limit: number;
    status?: CredentialStatus;
    issuedFrom?: string;
    issuedTo?: string;
  }) {
    const credentialWhere: Prisma.CredentialWhereInput = {};

    if (input.status) {
      credentialWhere.status = input.status;
    }

    if (input.issuedFrom || input.issuedTo) {
      credentialWhere.issuedAt = {
        ...(input.issuedFrom
          ? {
              gte: new Date(input.issuedFrom),
            }
          : {}),

        ...(input.issuedTo
          ? {
              lte: new Date(input.issuedTo),
            }
          : {}),
      };
    }

    const where: Prisma.WalletCredentialWhereInput = {
      holderId: input.holderId,

      ...(Object.keys(credentialWhere).length > 0
        ? {
            credential: credentialWhere,
          }
        : {}),
    };

    const skip = (input.page - 1) * input.limit;

    const [data, total] = await Promise.all([
      this.prisma.walletCredential.findMany({
        where,

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

        skip,
        take: input.limit,
      }),

      this.prisma.walletCredential.count({
        where,
      }),
    ]);

    return {
      data,

      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }

  async findPendingRequestsPaginated(input: {
    holderId: string;
    page: number;
    limit: number;
  }) {
    const now = new Date();

    await this.prisma.verificationRequest.updateMany({
      where: {
        holderId: input.holderId,
        status: VerificationRequestStatus.PENDING,
        expiresAt: {
          lte: now,
        },
      },

      data: {
        status: VerificationRequestStatus.EXPIRED,
      },
    });

    const where: Prisma.VerificationRequestWhereInput = {
      holderId: input.holderId,

      status: VerificationRequestStatus.PENDING,

      expiresAt: {
        gt: now,
      },
    };

    const skip = (input.page - 1) * input.limit;

    const [requests, total] = await Promise.all([
      this.prisma.verificationRequest.findMany({
        where,

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

        skip,
        take: input.limit,
      }),

      this.prisma.verificationRequest.count({
        where,
      }),
    ]);

    return {
      data: requests.map((request) => ({
        requestId: request.id,
        bank: request.application.job.bank.name,
        job: request.application.job.title,
        requestedClaims: request.requestedClaims,
        expiresAt: request.expiresAt,
      })),

      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }
}
