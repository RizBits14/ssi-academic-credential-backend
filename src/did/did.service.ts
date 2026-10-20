import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { EncryptionService } from '../crypto/encryption.service';
import { SignatureService } from '../crypto/signature.service';
import {
  DidKeyStatus,
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
  currentKeyVersion: number;
  status: DidStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DidSigningResult {
  did: string;
  keyVersion: number;
  signature: string;
}

export interface DidKeyRotationResult {
  did: string;
  keyVersion: number;
  verificationMethod: string;
  publicKey: string;
}

export interface DidKeyRevocationResult {
  did: string;
  keyVersion: number;
  verificationMethod: string;
  status: DidKeyStatus;
  revokedAt: Date;
}

export interface ResolvedDidDocument {
  id: string;
  controller: string;
  verificationMethod: {
    id: string;
    type: 'Ed25519VerificationKey';
    publicKey: string;
  };
  status: DidStatus;
}

interface PublicDidKeyRecord {
  id: string;
  didId: string;
  version: number;
  publicKey: string;
  algorithm: string;
  status: DidKeyStatus;
  createdAt: Date;
  retiredAt: Date | null;
  revokedAt: Date | null;
}

interface SigningDidKeyRecord {
  publicKey: string;
  encryptedPrivateKey: string;
  iv: string;
  authTag: string;
  algorithm: string;
  version: number;
  status: DidKeyStatus;
}

const publicDidSelect = {
  id: true,
  did: true,
  ownerType: true,
  ownerId: true,
  currentKeyVersion: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const publicDidKeySelect = {
  id: true,
  didId: true,
  version: true,
  publicKey: true,
  algorithm: true,
  status: true,
  createdAt: true,
  retiredAt: true,
  revokedAt: true,
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
    return this.prisma.did.findUnique({
      where: {
        ownerType_ownerId: {
          ownerType,
          ownerId,
        },
      },
      select: publicDidSelect,
    });
  }

  async resolveDid(did: string): Promise<ResolvedDidDocument> {
    const record = await this.findPublicByDid(did);

    if (!record) {
      throw new NotFoundException('DID not found');
    }

    const key = await this.findPublicKeyByVersion(
      record.id,
      record.currentKeyVersion,
    );

    if (!key || key.status !== DidKeyStatus.ACTIVE) {
      throw new ConflictException('Current DID key is not active');
    }

    this.assertSupportedAlgorithm(key.algorithm);

    return this.buildResolvedDidDocument(record, key);
  }

  async resolveVerificationMethod(
    did: string,
    verificationMethod: string,
  ): Promise<ResolvedDidDocument> {
    const record = await this.findPublicByDid(did);

    if (!record || record.status !== DidStatus.ACTIVE) {
      throw new NotFoundException('DID verification method not found');
    }

    const version = this.parseVerificationMethodVersion(
      did,
      verificationMethod,
    );

    const key = await this.findPublicKeyByVersion(record.id, version);

    if (!key || key.status === DidKeyStatus.REVOKED) {
      throw new NotFoundException('DID verification method not found');
    }

    this.assertSupportedAlgorithm(key.algorithm);

    return this.buildResolvedDidDocument(record, key);
  }

  async signForOrganization(
    organizationId: string,
    data: string,
  ): Promise<DidSigningResult> {
    const didRecord = await this.requireActiveOrganizationDid(organizationId);

    const key = await this.findSigningDidKeyByVersion(
      didRecord.id,
      didRecord.currentKeyVersion,
    );

    if (!key) {
      throw new NotFoundException('Organization DID signing key not found');
    }

    this.assertKeyCanSign(key, 'Organization');

    const privateKey = this.encryptionService.decrypt({
      ciphertext: key.encryptedPrivateKey,
      iv: key.iv,
      authTag: key.authTag,
    });

    const signature = this.signatureService.sign(data, privateKey);

    return {
      did: didRecord.did,
      keyVersion: key.version,
      signature,
    };
  }

  async signForUser(userId: string, data: string): Promise<DidSigningResult> {
    const didRecord = await this.requireActiveHolderDid(
      userId,
      'Only holders can sign with user DIDs',
    );

    const key = await this.findSigningDidKeyByVersion(
      didRecord.id,
      didRecord.currentKeyVersion,
    );

    if (!key) {
      throw new NotFoundException('Holder DID signing key not found');
    }

    this.assertKeyCanSign(key, 'Holder');

    const privateKey = this.encryptionService.decrypt({
      ciphertext: key.encryptedPrivateKey,
      iv: key.iv,
      authTag: key.authTag,
    });

    const signature = this.signatureService.sign(data, privateKey);

    return {
      did: didRecord.did,
      keyVersion: key.version,
      signature,
    };
  }

  async rotateForOrganization(
    organizationId: string,
    actorId?: string,
  ): Promise<DidKeyRotationResult> {
    const didRecord = await this.requireActiveOrganizationDid(organizationId);

    return this.rotateKey(
      didRecord,
      DidOwnerType.ORGANIZATION,
      organizationId,
      actorId,
    );
  }

  async rotateForUser(userId: string): Promise<DidKeyRotationResult> {
    const didRecord = await this.requireActiveHolderDid(
      userId,
      'Only holders can rotate user DID keys',
    );

    return this.rotateKey(didRecord, DidOwnerType.USER, userId, userId);
  }

  async revokeHistoricalKeyForOrganization(
    organizationId: string,
    keyVersion: number,
    actorId: string,
    reason?: string,
  ): Promise<DidKeyRevocationResult> {
    const didRecord = await this.requireActiveOrganizationDid(organizationId);

    return this.revokeHistoricalKey(
      didRecord,
      keyVersion,
      DidOwnerType.ORGANIZATION,
      organizationId,
      actorId,
      reason,
    );
  }

  async revokeHistoricalKeyForUser(
    userId: string,
    keyVersion: number,
    reason?: string,
  ): Promise<DidKeyRevocationResult> {
    const didRecord = await this.requireActiveHolderDid(
      userId,
      'Only holders can revoke user DID keys',
    );

    return this.revokeHistoricalKey(
      didRecord,
      keyVersion,
      DidOwnerType.USER,
      userId,
      userId,
      reason,
    );
  }

  async recoverForOrganization(
    organizationId: string,
    actorId: string,
    reason?: string,
  ): Promise<DidKeyRotationResult> {
    const didRecord = await this.requireActiveOrganizationDid(organizationId);

    return this.recoverCurrentKey(
      didRecord,
      DidOwnerType.ORGANIZATION,
      organizationId,
      actorId,
      reason,
    );
  }

  async recoverForUser(
    userId: string,
    reason?: string,
  ): Promise<DidKeyRotationResult> {
    const didRecord = await this.requireActiveHolderDid(
      userId,
      'Only holders can recover user DIDs',
    );

    return this.recoverCurrentKey(
      didRecord,
      DidOwnerType.USER,
      userId,
      userId,
      reason,
    );
  }

  private async requireActiveOrganizationDid(
    organizationId: string,
  ): Promise<PublicDidRecord> {
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

    const didRecord = await this.findPublicByOwner(
      DidOwnerType.ORGANIZATION,
      organizationId,
    );

    if (!didRecord) {
      throw new NotFoundException('Organization DID not found');
    }

    if (didRecord.status !== DidStatus.ACTIVE) {
      throw new ConflictException('Organization DID is not active');
    }

    return didRecord;
  }

  private async requireActiveHolderDid(
    userId: string,
    roleErrorMessage: string,
  ): Promise<PublicDidRecord> {
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
      throw new ConflictException(roleErrorMessage);
    }

    const didRecord = await this.findPublicByOwner(DidOwnerType.USER, userId);

    if (!didRecord) {
      throw new NotFoundException('Holder DID not found');
    }

    if (didRecord.status !== DidStatus.ACTIVE) {
      throw new ConflictException('Holder DID is not active');
    }

    return didRecord;
  }

  private async findPublicKeyByVersion(
    didId: string,
    version: number,
  ): Promise<PublicDidKeyRecord | null> {
    return this.prisma.didKey.findUnique({
      where: {
        didId_version: {
          didId,
          version,
        },
      },
      select: publicDidKeySelect,
    });
  }

  private async findSigningDidKeyByVersion(
    didId: string,
    version: number,
  ): Promise<SigningDidKeyRecord | null> {
    return this.prisma.didKey.findUnique({
      where: {
        didId_version: {
          didId,
          version,
        },
      },
      select: {
        publicKey: true,
        encryptedPrivateKey: true,
        iv: true,
        authTag: true,
        algorithm: true,
        version: true,
        status: true,
      },
    });
  }

  private parseVerificationMethodVersion(
    did: string,
    verificationMethod: string,
  ): number {
    const prefix = `${did}#key-`;

    if (!verificationMethod.startsWith(prefix)) {
      throw new NotFoundException('DID verification method not found');
    }

    const versionText = verificationMethod.slice(prefix.length);

    if (!/^[1-9]\d*$/.test(versionText)) {
      throw new NotFoundException('DID verification method not found');
    }

    return Number(versionText);
  }

  private assertSupportedAlgorithm(algorithm: string): void {
    if (algorithm !== 'Ed25519') {
      throw new ConflictException('DID algorithm is not supported');
    }
  }

  private assertKeyCanSign(key: SigningDidKeyRecord, ownerLabel: string): void {
    if (key.status !== DidKeyStatus.ACTIVE) {
      throw new ConflictException(
        `${ownerLabel} DID signing key is not active`,
      );
    }

    if (key.algorithm !== 'Ed25519') {
      throw new ConflictException(
        `${ownerLabel} DID algorithm is not supported`,
      );
    }
  }

  private buildResolvedDidDocument(
    didRecord: PublicDidRecord,
    key: PublicDidKeyRecord,
  ): ResolvedDidDocument {
    return {
      id: didRecord.did,
      controller: didRecord.did,
      verificationMethod: {
        id: `${didRecord.did}#key-${key.version}`,
        type: 'Ed25519VerificationKey',
        publicKey: key.publicKey,
      },
      status: didRecord.status,
    };
  }

  private validateKeyVersion(keyVersion: number): void {
    if (!Number.isInteger(keyVersion) || keyVersion < 1) {
      throw new BadRequestException(
        'DID key version must be a positive integer',
      );
    }
  }

  private auditActorId(
    ownerType: DidOwnerType,
    ownerId: string,
    actorId?: string,
  ): string | undefined {
    if (actorId) {
      return actorId;
    }

    return ownerType === DidOwnerType.USER ? ownerId : undefined;
  }

  private async rotateKey(
    didRecord: PublicDidRecord,
    ownerType: DidOwnerType,
    ownerId: string,
    actorId?: string,
  ): Promise<DidKeyRotationResult> {
    const keyPair = this.signatureService.generateKeyPair();

    const encryptedPrivateKey = this.encryptionService.encrypt(
      keyPair.privateKey,
    );

    const previousVersion = didRecord.currentKeyVersion;
    const nextVersion = previousVersion + 1;
    const rotatedAt = new Date();

    return this.prisma.$transaction(async (transaction) => {
      const didTransition = await transaction.did.updateMany({
        where: {
          id: didRecord.id,
          status: DidStatus.ACTIVE,
          currentKeyVersion: previousVersion,
        },
        data: {
          currentKeyVersion: nextVersion,
        },
      });

      if (didTransition.count !== 1) {
        throw new ConflictException('DID key has already been rotated');
      }

      const previousKeyTransition = await transaction.didKey.updateMany({
        where: {
          didId: didRecord.id,
          version: previousVersion,
          status: DidKeyStatus.ACTIVE,
        },
        data: {
          status: DidKeyStatus.RETIRED,
          retiredAt: rotatedAt,
        },
      });

      if (previousKeyTransition.count !== 1) {
        throw new ConflictException('Current DID key is no longer active');
      }

      const newKey = await transaction.didKey.create({
        data: {
          didId: didRecord.id,
          version: nextVersion,
          publicKey: keyPair.publicKey,
          encryptedPrivateKey: encryptedPrivateKey.ciphertext,
          iv: encryptedPrivateKey.iv,
          authTag: encryptedPrivateKey.authTag,
          algorithm: 'Ed25519',
          status: DidKeyStatus.ACTIVE,
        },
        select: publicDidKeySelect,
      });

      const auditActorId = this.auditActorId(ownerType, ownerId, actorId);

      await transaction.auditLog.create({
        data: {
          ...(auditActorId
            ? {
                actorId: auditActorId,
              }
            : {}),
          ...(ownerType === DidOwnerType.ORGANIZATION
            ? {
                organizationId: ownerId,
              }
            : {}),
          action: 'DID_KEY_ROTATED',
          resourceType: 'DID',
          resourceId: didRecord.id,
          metadata: {
            did: didRecord.did,
            ownerType,
            ownerId,
            previousKeyVersion: previousVersion,
            newKeyVersion: nextVersion,
          },
        },
      });

      return {
        did: didRecord.did,
        keyVersion: newKey.version,
        verificationMethod: `${didRecord.did}#key-${newKey.version}`,
        publicKey: newKey.publicKey,
      };
    });
  }

  private async revokeHistoricalKey(
    didRecord: PublicDidRecord,
    keyVersion: number,
    ownerType: DidOwnerType,
    ownerId: string,
    actorId: string,
    reason?: string,
  ): Promise<DidKeyRevocationResult> {
    this.validateKeyVersion(keyVersion);

    if (keyVersion === didRecord.currentKeyVersion) {
      throw new ConflictException(
        'Current DID key must be recovered instead of revoked',
      );
    }

    const key = await this.findPublicKeyByVersion(didRecord.id, keyVersion);

    if (!key) {
      throw new NotFoundException('DID key not found');
    }

    if (key.status === DidKeyStatus.REVOKED) {
      throw new ConflictException('DID key is already revoked');
    }

    if (key.status !== DidKeyStatus.RETIRED) {
      throw new ConflictException(
        'Only a retired historical DID key can be revoked',
      );
    }

    const revokedAt = new Date();

    return this.prisma.$transaction(async (transaction) => {
      const keyTransition = await transaction.didKey.updateMany({
        where: {
          didId: didRecord.id,
          version: keyVersion,
          status: DidKeyStatus.RETIRED,
        },
        data: {
          status: DidKeyStatus.REVOKED,
          revokedAt,
        },
      });

      if (keyTransition.count !== 1) {
        throw new ConflictException('DID key status changed; retry request');
      }

      await transaction.auditLog.create({
        data: {
          actorId,
          ...(ownerType === DidOwnerType.ORGANIZATION
            ? {
                organizationId: ownerId,
              }
            : {}),
          action: 'DID_KEY_REVOKED',
          resourceType: 'DID',
          resourceId: didRecord.id,
          metadata: {
            did: didRecord.did,
            ownerType,
            ownerId,
            keyVersion,
            ...(reason
              ? {
                  reason,
                }
              : {}),
          },
        },
      });

      return {
        did: didRecord.did,
        keyVersion,
        verificationMethod: `${didRecord.did}#key-${keyVersion}`,
        status: DidKeyStatus.REVOKED,
        revokedAt,
      };
    });
  }

  private async recoverCurrentKey(
    didRecord: PublicDidRecord,
    ownerType: DidOwnerType,
    ownerId: string,
    actorId: string,
    reason?: string,
  ): Promise<DidKeyRotationResult> {
    const keyPair = this.signatureService.generateKeyPair();

    const encryptedPrivateKey = this.encryptionService.encrypt(
      keyPair.privateKey,
    );

    const compromisedVersion = didRecord.currentKeyVersion;
    const nextVersion = compromisedVersion + 1;
    const recoveredAt = new Date();

    return this.prisma.$transaction(async (transaction) => {
      const didTransition = await transaction.did.updateMany({
        where: {
          id: didRecord.id,
          status: DidStatus.ACTIVE,
          currentKeyVersion: compromisedVersion,
        },
        data: {
          currentKeyVersion: nextVersion,
        },
      });

      if (didTransition.count !== 1) {
        throw new ConflictException('DID key has already changed');
      }

      const compromisedKeyTransition = await transaction.didKey.updateMany({
        where: {
          didId: didRecord.id,
          version: compromisedVersion,
          status: DidKeyStatus.ACTIVE,
        },
        data: {
          status: DidKeyStatus.REVOKED,
          revokedAt: recoveredAt,
        },
      });

      if (compromisedKeyTransition.count !== 1) {
        throw new ConflictException('Current DID key is no longer active');
      }

      const newKey = await transaction.didKey.create({
        data: {
          didId: didRecord.id,
          version: nextVersion,
          publicKey: keyPair.publicKey,
          encryptedPrivateKey: encryptedPrivateKey.ciphertext,
          iv: encryptedPrivateKey.iv,
          authTag: encryptedPrivateKey.authTag,
          algorithm: 'Ed25519',
          status: DidKeyStatus.ACTIVE,
        },
        select: publicDidKeySelect,
      });

      await transaction.auditLog.create({
        data: {
          actorId,
          ...(ownerType === DidOwnerType.ORGANIZATION
            ? {
                organizationId: ownerId,
              }
            : {}),
          action: 'DID_KEY_RECOVERED',
          resourceType: 'DID',
          resourceId: didRecord.id,
          metadata: {
            did: didRecord.did,
            ownerType,
            ownerId,
            compromisedKeyVersion: compromisedVersion,
            newKeyVersion: nextVersion,
            ...(reason
              ? {
                  reason,
                }
              : {}),
          },
        },
      });

      return {
        did: didRecord.did,
        keyVersion: newKey.version,
        verificationMethod: `${didRecord.did}#key-${newKey.version}`,
        publicKey: newKey.publicKey,
      };
    });
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
          currentKeyVersion: 1,
          status: DidStatus.ACTIVE,
        },
        select: publicDidSelect,
      });

      await transaction.didKey.create({
        data: {
          didId: didRecord.id,
          version: 1,
          publicKey: keyPair.publicKey,
          encryptedPrivateKey: encryptedPrivateKey.ciphertext,
          iv: encryptedPrivateKey.iv,
          authTag: encryptedPrivateKey.authTag,
          algorithm: 'Ed25519',
          status: DidKeyStatus.ACTIVE,
        },
      });

      const auditActorId = this.auditActorId(ownerType, ownerId);

      await transaction.auditLog.create({
        data: {
          ...(auditActorId
            ? {
                actorId: auditActorId,
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
            keyVersion: 1,
          },
        },
      });

      return didRecord;
    });
  }
}
