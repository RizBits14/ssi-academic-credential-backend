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
  OrganizationType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DidService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly signatureService: SignatureService,
  ) {}

  async createForOrganization(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: {
        id: organizationId,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const existingDid = await this.findByOwner(
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

  async createForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingDid = await this.findByOwner(DidOwnerType.USER, userId);

    if (existingDid) {
      throw new ConflictException('User already has a DID');
    }

    return this.createDid(DidOwnerType.USER, userId, 'holder');
  }

  async findByDid(did: string) {
    return this.prisma.did.findUnique({
      where: {
        did,
      },
    });
  }

  async findByOwner(ownerType: DidOwnerType, ownerId: string) {
    return this.prisma.did.findFirst({
      where: {
        ownerType,
        ownerId,
      },
    });
  }

  async resolveDid(did: string) {
    const record = await this.findByDid(did);

    if (!record) {
      throw new NotFoundException('DID not found');
    }

    return {
      id: record.did,
      controller: record.ownerId,

      verificationMethod: {
        id: `${record.did}#key-${record.keyVersion}`,
        type: 'Ed25519VerificationKey',
        publicKey: record.publicKey,
      },

      status: record.status,
    };
  }

  async signForOrganization(organizationId: string, data: string) {
    const didRecord = await this.findByOwner(
      DidOwnerType.ORGANIZATION,
      organizationId,
    );

    if (!didRecord) {
      throw new NotFoundException('Organization DID not found');
    }

    if (didRecord.status !== DidStatus.ACTIVE) {
      throw new ConflictException('Organization DID is not active');
    }

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

  async signForUser(userId: string, data: string) {
    const didRecord = await this.findByOwner(DidOwnerType.USER, userId);

    if (!didRecord) {
      throw new NotFoundException('Holder DID not found');
    }

    if (didRecord.status !== DidStatus.ACTIVE) {
      throw new ConflictException('Holder DID is not active');
    }

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

  private async createDid(
    ownerType: DidOwnerType,
    ownerId: string,
    prefix: string,
  ) {
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
