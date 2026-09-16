import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DidService } from '../did/did.service';
import {
  DidOwnerType,
  DidStatus,
  OrganizationType,
  TrustedIssuerStatus,
} from '../generated/prisma/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { PrismaService } from '../prisma/prisma.service';

interface AddTrustedIssuerInput {
  organizationId: string;
  issuerDid: string;
  approvedBy: string;
}

@Injectable()
export class TrustRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
    private readonly didService: DidService,
  ) {}

  async create(input: AddTrustedIssuerInput) {
    const organization = await this.organizationsService.findById(
      input.organizationId,
    );

    if (!organization) {
      throw new NotFoundException('Issuer organization not found');
    }

    if (organization.type !== OrganizationType.UNIVERSITY) {
      throw new ConflictException('Only university issuers can be trusted');
    }

    const didRecord = await this.didService.findByDid(input.issuerDid);

    if (!didRecord) {
      throw new NotFoundException('Issuer DID not found');
    }

    if (
      didRecord.ownerType !== DidOwnerType.ORGANIZATION ||
      didRecord.ownerId !== organization.id
    ) {
      throw new ConflictException(
        'Issuer DID does not belong to the organization',
      );
    }

    if (didRecord.status !== DidStatus.ACTIVE) {
      throw new ConflictException('Issuer DID is not active');
    }

    const existing = await this.prisma.trustedIssuer.findUnique({
      where: {
        issuerDid: input.issuerDid,
      },
    });

    if (existing) {
      throw new ConflictException('Issuer DID is already registered');
    }

    return this.prisma.$transaction(async (transaction) => {
      const trustedIssuer = await transaction.trustedIssuer.create({
        data: {
          organizationId: organization.id,
          issuerDid: input.issuerDid,
          approvedBy: input.approvedBy,
          status: TrustedIssuerStatus.TRUSTED,
        },
        include: {
          organization: true,
          approvedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      });

      await transaction.auditLog.create({
        data: {
          actorId: input.approvedBy,
          organizationId: organization.id,
          action: 'TRUSTED_ISSUER_ADDED',
          resourceType: 'TrustedIssuer',
          resourceId: trustedIssuer.id,
          metadata: {
            issuerDid: input.issuerDid,
          },
        },
      });

      return trustedIssuer;
    });
  }

  async findAll() {
    return this.prisma.trustedIssuer.findMany({
      include: {
        organization: true,
        approvedByUser: {
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

  async findByDid(issuerDid: string) {
    const trustedIssuer = await this.prisma.trustedIssuer.findUnique({
      where: {
        issuerDid,
      },
      include: {
        organization: true,
      },
    });

    if (!trustedIssuer) {
      throw new NotFoundException('Trusted issuer not found');
    }

    return trustedIssuer;
  }

  async isTrusted(issuerDid: string): Promise<boolean> {
    const trustedIssuer = await this.prisma.trustedIssuer.findUnique({
      where: {
        issuerDid,
      },
    });

    return trustedIssuer?.status === TrustedIssuerStatus.TRUSTED;
  }

  async suspend(id: string, actorId: string) {
    const trustedIssuer = await this.prisma.trustedIssuer.findUnique({
      where: {
        id,
      },
    });

    if (!trustedIssuer) {
      throw new NotFoundException('Trusted issuer not found');
    }

    if (trustedIssuer.status !== TrustedIssuerStatus.TRUSTED) {
      throw new ConflictException('Only a trusted issuer can be suspended');
    }

    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.trustedIssuer.update({
        where: {
          id,
        },
        data: {
          status: TrustedIssuerStatus.SUSPENDED,
          suspendedAt: new Date(),
        },
      });

      await transaction.auditLog.create({
        data: {
          actorId,
          organizationId: trustedIssuer.organizationId,
          action: 'TRUSTED_ISSUER_SUSPENDED',
          resourceType: 'TrustedIssuer',
          resourceId: trustedIssuer.id,
          metadata: {
            issuerDid: trustedIssuer.issuerDid,
          },
        },
      });

      return updated;
    });
  }
}
