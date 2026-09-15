import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CredentialStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

interface ChangeCredentialStatusInput {
  credentialId: string;
  issuerOrganizationId: string;
  changedBy: string;
  reason?: string;
}

@Injectable()
export class CredentialStatusService {
  constructor(private readonly prisma: PrismaService) {}

  async suspend(input: ChangeCredentialStatusInput) {
    const credential = await this.findIssuerCredential(
      input.credentialId,
      input.issuerOrganizationId,
    );

    if (credential.status !== CredentialStatus.ACTIVE) {
      throw new ConflictException('Only an active credential can be suspended');
    }

    return this.changeStatus(
      credential.id,
      credential.status,
      CredentialStatus.SUSPENDED,
      input.changedBy,
      input.reason,
    );
  }

  async revoke(input: ChangeCredentialStatusInput) {
    const credential = await this.findIssuerCredential(
      input.credentialId,
      input.issuerOrganizationId,
    );

    if (credential.status === CredentialStatus.REVOKED) {
      throw new ConflictException('Credential is already revoked');
    }

    return this.changeStatus(
      credential.id,
      credential.status,
      CredentialStatus.REVOKED,
      input.changedBy,
      input.reason,
    );
  }

  async reactivate(input: ChangeCredentialStatusInput) {
    const credential = await this.findIssuerCredential(
      input.credentialId,
      input.issuerOrganizationId,
    );

    if (credential.status !== CredentialStatus.SUSPENDED) {
      throw new ConflictException(
        'Only a suspended credential can be reactivated',
      );
    }

    return this.changeStatus(
      credential.id,
      credential.status,
      CredentialStatus.ACTIVE,
      input.changedBy,
      input.reason,
    );
  }

  async getStatus(credentialId: string) {
    const credential = await this.prisma.credential.findUnique({
      where: {
        id: credentialId,
      },
      select: {
        id: true,
        status: true,
        expiresAt: true,
      },
    });

    if (!credential) {
      throw new NotFoundException('Credential not found');
    }

    return {
      credentialId: credential.id,
      status: credential.status,
      expiresAt: credential.expiresAt,
    };
  }

  async getHistory(credentialId: string) {
    const credential = await this.prisma.credential.findUnique({
      where: {
        id: credentialId,
      },
      select: {
        id: true,
      },
    });

    if (!credential) {
      throw new NotFoundException('Credential not found');
    }

    return this.prisma.credentialStatusHistory.findMany({
      where: {
        credentialId,
      },
      include: {
        changedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  private async findIssuerCredential(
    credentialId: string,
    issuerOrganizationId: string,
  ) {
    const credential = await this.prisma.credential.findFirst({
      where: {
        id: credentialId,
        issuerOrganizationId,
      },
    });

    if (!credential) {
      throw new NotFoundException('Credential not found');
    }

    return credential;
  }

  private async changeStatus(
    credentialId: string,
    previousStatus: CredentialStatus,
    newStatus: CredentialStatus,
    changedBy: string,
    reason?: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const credential = await transaction.credential.update({
        where: {
          id: credentialId,
        },
        data: {
          status: newStatus,
        },
      });

      await transaction.credentialStatusHistory.create({
        data: {
          credentialId,
          previousStatus,
          newStatus,
          changedBy,
          reason,
        },
      });

      return credential;
    });
  }
}
