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

    return this.prisma.trustedIssuer.create({
      data: {
        organizationId: organization.id,
        issuerDid: input.issuerDid,
        approvedBy: input.approvedBy,
        status: TrustedIssuerStatus.TRUSTED,
      },
      include: {
        organization: true,
        approvedByUser: true,
      },
    });
  }

  async findAll() {
    return this.prisma.trustedIssuer.findMany({
      include: {
        organization: true,
        approvedByUser: true,
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
}
