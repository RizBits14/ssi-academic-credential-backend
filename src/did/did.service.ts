import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { EncryptionService } from '../crypto/encryption.service';
import { SignatureService } from '../crypto/signature.service';
import {
  DidOwnerType,
  DidStatus,
  OrganizationStatus,
  OrganizationType,
  UserRole,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

export interface PublicDidRecord {
  id: string;
  did: string;
  ownerType: DidOwnerType;
  ownerId: string;
  publicKey: string;
  algorithm: string;
  keyVersion: number;
  status: DidStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DidSigningResult {
  did: string;
  keyVersion: number;
  signature: string;
}

interface SigningDidRecord {
  did: string;
  encryptedPrivateKey: string;
  iv: string;
  authTag: string;
  algorithm: string;
  keyVersion: number;
  status: DidStatus;
}

const publicDidSelect = {
  id: true,
  did: true,
  ownerType: true,
  ownerId: true,
  publicKey: true,
  algorithm: true,
  keyVersion: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class DidService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly signatureService: SignatureService,
  ) {}

  async createForOrganization(
    organizationId: string,
  ): Promise<PublicDidRecord> {
    const organization = await this.prisma.organization.findUnique({
      where: {
        id: organizationId,
      },
      select: {
        id: true,
        type: true,
        status: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (organization.status !== OrganizationStatus.ACTIVE) {
      throw new ConflictException('Organization is not active');
    }

    const existingDid = await this.findPublicByOwner(
      DidOwnerType.ORGANIZATION,
      organizationId,
    );

    if (existingDid) {
      throw new ConflictException('Organization already has a DID');
    }

    const prefix =
      organization.type === OrganizationType.UNIVERSITY ? 'university' : 'bank';

    return this.createDid(DidOwnerType.ORGANIZATION, organizationId, prefix);
  }

  async createForUser(userId: string): Promise<PublicDidRecord> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== UserRole.HOLDER) {
      throw new ConflictException('Only holders can have user DIDs');
    }

    const existingDid = await this.findPublicByOwner(DidOwnerType.USER, userId);

    if (existingDid) {
      throw new ConflictException('User already has a DID');
    }

    return this.createDid(DidOwnerType.USER, userId, 'holder');
  }

  async findPublicByDid(did: string): Promise<PublicDidRecord | null> {
    return this.prisma.did.findUnique({
      where: {
        did,
      },
      select: publicDidSelect,
    });
  }

  async findPublicByOwner(
    ownerType: DidOwnerType,
    ownerId: string,
  ): Promise<PublicDidRecord | null> {
    return this.prisma.did.findFirst({
      where: {
        ownerType,
        ownerId,
      },
      select: publicDidSelect,
    });
  }

  async resolveDid(did: string) {
    const record = await this.findPublicByDid(did);

    if (!record) {
      throw new NotFoundException('DID not found');
    }

    if (record.algorithm !== 'Ed25519') {
      throw new ConflictException('DID algorithm is not supported');
    }

    return {
      id: record.did,
      controller: record.did,
      verificationMethod: {
        id: `${record.did}#key-${record.keyVersion}`,
        type: 'Ed25519VerificationKey',
        publicKey: record.publicKey,
      },
      status: record.status,
    };
  }

  async signForOrganization(
    organizationId: string,
    data: string,
  ): Promise<DidSigningResult> {
    const organization = await this.prisma.organization.findUnique({
      where: {
        id: organizationId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (organization.status !== OrganizationStatus.ACTIVE) {
      throw new ConflictException('Organization is not active');
    }

    const didRecord = await this.findSigningDidByOwner(
      DidOwnerType.ORGANIZATION,
      organizationId,
    );

    if (!didRecord) {
      throw new NotFoundException('Organization DID not found');
    }

    this.assertDidCanSign(
      didRecord.status,
      didRecord.algorithm,
      'Organization',
    );

    const privateKey = this.encryptionService.decrypt({
      ciphertext: didRecord.encryptedPrivateKey,
      iv: didRecord.iv,
      authTag: didRecord.authTag,
    });

    const signature = this.signatureService.sign(data, privateKey);

    return {
      did: didRecord.did,
      keyVersion: didRecord.keyVersion,
      signature,
    };
  }

  async signForUser(userId: string, data: string): Promise<DidSigningResult> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== UserRole.HOLDER) {
      throw new ConflictException('Only holders can sign with user DIDs');
    }

    const didRecord = await this.findSigningDidByOwner(
      DidOwnerType.USER,
      userId,
    );

    if (!didRecord) {
      throw new NotFoundException('Holder DID not found');
    }

    this.assertDidCanSign(didRecord.status, didRecord.algorithm, 'Holder');

    const privateKey = this.encryptionService.decrypt({
      ciphertext: didRecord.encryptedPrivateKey,
      iv: didRecord.iv,
      authTag: didRecord.authTag,
    });

    const signature = this.signatureService.sign(data, privateKey);

    return {
      did: didRecord.did,
      keyVersion: didRecord.keyVersion,
      signature,
    };
  }

  private async findSigningDidByOwner(
    ownerType: DidOwnerType,
    ownerId: string,
  ): Promise<SigningDidRecord | null> {
    return this.prisma.did.findFirst({
      where: {
        ownerType,
        ownerId,
      },
      select: {
        did: true,
        encryptedPrivateKey: true,
        iv: true,
        authTag: true,
        algorithm: true,
        keyVersion: true,
        status: true,
      },
    });
  }

  private assertDidCanSign(
    status: DidStatus,
    algorithm: string,
    ownerLabel: string,
  ): void {
    if (status !== DidStatus.ACTIVE) {
      throw new ConflictException(`${ownerLabel} DID is not active`);
    }

    if (algorithm !== 'Ed25519') {
      throw new ConflictException(
        `${ownerLabel} DID algorithm is not supported`,
      );
    }
  }

  private async createDid(
    ownerType: DidOwnerType,
    ownerId: string,
    prefix: string,
  ): Promise<PublicDidRecord> {
    const keyPair = this.signatureService.generateKeyPair();

    const encryptedPrivateKey = this.encryptionService.encrypt(
      keyPair.privateKey,
    );

    const did = `did:mock:${prefix}:${randomUUID()}`;

    return this.prisma.$transaction(async (transaction) => {
      const didRecord = await transaction.did.create({
        data: {
          did,
          ownerType,
          ownerId,
          publicKey: keyPair.publicKey,
          encryptedPrivateKey: encryptedPrivateKey.ciphertext,
          iv: encryptedPrivateKey.iv,
          authTag: encryptedPrivateKey.authTag,
          algorithm: 'Ed25519',
          keyVersion: 1,
          status: DidStatus.ACTIVE,
        },
        select: publicDidSelect,
      });

      await transaction.auditLog.create({
        data: {
          ...(ownerType === DidOwnerType.USER
            ? {
                actorId: ownerId,
              }
            : {}),
          ...(ownerType === DidOwnerType.ORGANIZATION
            ? {
                organizationId: ownerId,
              }
            : {}),
          action: 'DID_CREATED',
          resourceType: 'DID',
          resourceId: didRecord.id,
          metadata: {
            did,
            ownerType,
            ownerId,
          },
        },
      });

      return didRecord;
    });
  }
}
