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

    return this.changeStatus({
      credentialId: credential.id,
      issuerOrganizationId: input.issuerOrganizationId,
      previousStatus: credential.status,
      newStatus: CredentialStatus.SUSPENDED,
      changedBy: input.changedBy,
      reason: input.reason,
      auditAction: 'CREDENTIAL_SUSPENDED',
    });
  }

  async revoke(input: ChangeCredentialStatusInput) {
    const credential = await this.findIssuerCredential(
      input.credentialId,
      input.issuerOrganizationId,
    );

    if (credential.status === CredentialStatus.REVOKED) {
      throw new ConflictException('Credential is already revoked');
    }

    if (credential.status === CredentialStatus.EXPIRED) {
      throw new ConflictException('An expired credential cannot be revoked');
    }

    return this.changeStatus({
      credentialId: credential.id,
      issuerOrganizationId: input.issuerOrganizationId,
      previousStatus: credential.status,
      newStatus: CredentialStatus.REVOKED,
      changedBy: input.changedBy,
      reason: input.reason,
      auditAction: 'CREDENTIAL_REVOKED',
    });
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

    return this.changeStatus({
      credentialId: credential.id,
      issuerOrganizationId: input.issuerOrganizationId,
      previousStatus: credential.status,
      newStatus: CredentialStatus.ACTIVE,
      changedBy: input.changedBy,
      reason: input.reason,
      auditAction: 'CREDENTIAL_REACTIVATED',
    });
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

  private async changeStatus(input: {
    credentialId: string;
    issuerOrganizationId: string;
    previousStatus: CredentialStatus;
    newStatus: CredentialStatus;
    changedBy: string;
    reason?: string;
    auditAction: string;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      const credential = await transaction.credential.update({
        where: {
          id: input.credentialId,
        },
        data: {
          status: input.newStatus,
        },
      });

      await transaction.credentialStatusHistory.create({
        data: {
          credentialId: input.credentialId,
          previousStatus: input.previousStatus,
          newStatus: input.newStatus,
          changedBy: input.changedBy,
          reason: input.reason,
        },
      });

      await transaction.auditLog.create({
        data: {
          actorId: input.changedBy,
          organizationId: input.issuerOrganizationId,
          action: input.auditAction,
          resourceType: 'Credential',
          resourceId: input.credentialId,
          metadata: {
            previousStatus: input.previousStatus,
            newStatus: input.newStatus,
            ...(input.reason
              ? {
                  reason: input.reason,
                }
              : {}),
          },
        },
      });

      return credential;
    });
  }
}
