import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createPublicKey, randomUUID } from 'node:crypto';

import { EncryptionService } from '../crypto/encryption.service';
import {
  SignatureService,
  type SupportedSignatureAlgorithm,
} from '../crypto/signature.service';
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
    type: 'Multikey';
    controller: string;
    publicKeyMultibase: string;

    /**
     * Internal compatibility field.
     *
     * The PEM public key remains available because the current
     * SignatureService verifies signatures using PEM keys.
     *
     * publicKeyMultibase is the standards-facing representation.
     */
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
  encryptionKeyId: string | null;
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
    algorithm: SupportedSignatureAlgorithm = 'Ed25519',
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

    return this.createDid(
      DidOwnerType.ORGANIZATION,
      organizationId,
      prefix,
      algorithm,
    );
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

    return this.createDid(DidOwnerType.USER, userId, 'holder', 'Ed25519');
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

    this.requireSupportedAlgorithm(key.algorithm);

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

    this.requireSupportedAlgorithm(key.algorithm);

    return this.buildResolvedDidDocument(record, key);
  }

  async signForOrganization(
    organizationId: string,
    data: string | Buffer,
    algorithm: SupportedSignatureAlgorithm = 'Ed25519',
  ): Promise<DidSigningResult> {
    const didRecord = await this.requireActiveOrganizationDid(organizationId);

    const key = await this.findSigningDidKeyByVersion(
      didRecord.id,
      didRecord.currentKeyVersion,
    );

    if (!key) {
      throw new NotFoundException('Organization DID signing key not found');
    }

    this.assertKeyCanSign(key, 'Organization', algorithm);

    const privateKey = this.encryptionService.decryptForDid({
      ciphertext: key.encryptedPrivateKey,
      iv: key.iv,
      authTag: key.authTag,
      keyId: key.encryptionKeyId,
    });

    const signature = this.signWithAlgorithm(data, privateKey, algorithm);

    return {
      did: didRecord.did,
      keyVersion: key.version,
      signature,
    };
  }

  async signForUser(
    userId: string,
    data: string | Buffer,
  ): Promise<DidSigningResult> {
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

    this.assertKeyCanSign(key, 'Holder', 'Ed25519');

    const privateKey = this.encryptionService.decryptForDid({
      ciphertext: key.encryptedPrivateKey,
      iv: key.iv,
      authTag: key.authTag,
      keyId: key.encryptionKeyId,
    });

    const signature = this.signWithAlgorithm(data, privateKey, 'Ed25519');

    return {
      did: didRecord.did,
      keyVersion: key.version,
      signature,
    };
  }

  async rotateForOrganization(
    organizationId: string,
    actorId?: string,
    algorithm?: SupportedSignatureAlgorithm,
  ): Promise<DidKeyRotationResult> {
    const didRecord = await this.requireActiveOrganizationDid(organizationId);

    const targetAlgorithm =
      algorithm ?? (await this.currentKeyAlgorithm(didRecord));

    return this.rotateKey(
      didRecord,
      DidOwnerType.ORGANIZATION,
      organizationId,
      actorId,
      targetAlgorithm,
    );
  }

  async rotateForUser(userId: string): Promise<DidKeyRotationResult> {
    const didRecord = await this.requireActiveHolderDid(
      userId,
      'Only holders can rotate user DID keys',
    );

    return this.rotateKey(
      didRecord,
      DidOwnerType.USER,
      userId,
      userId,
      'Ed25519',
    );
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
    algorithm?: SupportedSignatureAlgorithm,
  ): Promise<DidKeyRotationResult> {
    const didRecord = await this.requireActiveOrganizationDid(organizationId);

    const targetAlgorithm =
      algorithm ?? (await this.currentKeyAlgorithm(didRecord));

    return this.recoverCurrentKey(
      didRecord,
      DidOwnerType.ORGANIZATION,
      organizationId,
      actorId,
      reason,
      targetAlgorithm,
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
      'Ed25519',
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
        encryptionKeyId: true,
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

  private requireSupportedAlgorithm(
    algorithm: string,
  ): SupportedSignatureAlgorithm {
    if (algorithm === 'Ed25519' || algorithm === 'P-256') {
      return algorithm;
    }

    throw new ConflictException('DID algorithm is not supported');
  }

  private assertKeyCanSign(
    key: SigningDidKeyRecord,
    ownerLabel: string,
    expectedAlgorithm: SupportedSignatureAlgorithm,
  ): void {
    if (key.status !== DidKeyStatus.ACTIVE) {
      throw new ConflictException(
        `${ownerLabel} DID signing key is not active`,
      );
    }

    const keyAlgorithm = this.requireSupportedAlgorithm(key.algorithm);

    if (keyAlgorithm !== expectedAlgorithm) {
      throw new ConflictException(
        `${ownerLabel} DID signing key algorithm does not match requested algorithm`,
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
        type: 'Multikey',
        controller: didRecord.did,
        publicKeyMultibase: this.toPublicKeyMultibase(
          key.publicKey,
          key.algorithm,
        ),

        // Keep PEM internally until SignatureService is migrated to
        // verify directly from Multikey/publicKeyMultibase.
        publicKey: key.publicKey,
      },
      status: didRecord.status,
    };
  }

  private toPublicKeyMultibase(
    publicKeyPem: string,
    algorithm: string,
  ): string {
    const supportedAlgorithm = this.requireSupportedAlgorithm(algorithm);

    switch (supportedAlgorithm) {
      case 'Ed25519':
        return this.toEd25519PublicKeyMultibase(publicKeyPem);

      case 'P-256':
        return this.toP256PublicKeyMultibase(publicKeyPem);
    }
  }

  private toP256PublicKeyMultibase(publicKeyPem: string): string {
    try {
      const keyObject = createPublicKey(publicKeyPem);

      const jwk = keyObject.export({
        format: 'jwk',
      });

      if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) {
        throw new Error('Unsupported P-256 public key');
      }

      const x = Buffer.from(jwk.x, 'base64url');
      const y = Buffer.from(jwk.y, 'base64url');

      if (x.length !== 32 || y.length !== 32) {
        throw new Error('Invalid P-256 public key length');
      }

      const lastYByte = y[y.length - 1];

      if (lastYByte === undefined) {
        throw new Error('Invalid P-256 public key');
      }

      const compressedPointPrefix = (lastYByte & 1) === 0 ? 0x02 : 0x03;

      const compressedPublicKey = Buffer.concat([
        Buffer.from([compressedPointPrefix]),
        x,
      ]);

      /*
       * P-256 public Multikey:
       *
       * multicodec p256-pub = 0x1200
       * unsigned-varint encoding = 0x80 0x24
       *
       * Multikey bytes:
       *   0x80 0x24 || 33-byte compressed P-256 public key
       */
      const multicodecKey = Buffer.concat([
        Buffer.from([0x80, 0x24]),
        compressedPublicKey,
      ]);

      return `z${this.encodeBase58(multicodecKey)}`;
    } catch {
      throw new ConflictException('DID public key is invalid');
    }
  }

  private toEd25519PublicKeyMultibase(publicKeyPem: string): string {
    try {
      const keyObject = createPublicKey(publicKeyPem);

      const jwk = keyObject.export({
        format: 'jwk',
      });

      if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.x) {
        throw new Error('Unsupported Ed25519 public key');
      }

      const rawPublicKey = Buffer.from(jwk.x, 'base64url');

      if (rawPublicKey.length !== 32) {
        throw new Error('Invalid Ed25519 public key length');
      }

      /*
       * Ed25519 public Multikey:
       *
       * multicodec ed25519-pub = 0xed
       * unsigned-varint encoding = 0xed 0x01
       *
       * Multikey bytes:
       *   0xed 0x01 || 32-byte Ed25519 public key
       */
      const multicodecKey = Buffer.concat([
        Buffer.from([0xed, 0x01]),
        rawPublicKey,
      ]);

      /*
       * Multibase base58btc values use the "z" prefix.
       */
      return `z${this.encodeBase58(multicodecKey)}`;
    } catch {
      throw new ConflictException('DID public key is invalid');
    }
  }

  private encodeBase58(value: Uint8Array): string {
    const alphabet =
      '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

    if (value.length === 0) {
      return '';
    }

    let numericValue = 0n;

    for (const byte of value) {
      numericValue = numericValue * 256n + BigInt(byte);
    }

    let encoded = '';

    while (numericValue > 0n) {
      const remainder = Number(numericValue % 58n);

      encoded = alphabet[remainder] + encoded;
      numericValue /= 58n;
    }

    let leadingZeroCount = 0;

    for (const byte of value) {
      if (byte !== 0) {
        break;
      }

      leadingZeroCount += 1;
    }

    return '1'.repeat(leadingZeroCount) + encoded;
  }

  private generateKeyPairForAlgorithm(algorithm: SupportedSignatureAlgorithm) {
    if (algorithm === 'Ed25519') {
      return this.signatureService.generateKeyPair();
    }

    return this.signatureService.generateKeyPairForAlgorithm(algorithm);
  }

  private signWithAlgorithm(
    data: string | Buffer,
    privateKey: string,
    algorithm: SupportedSignatureAlgorithm,
  ): string {
    if (algorithm === 'Ed25519') {
      return this.signatureService.sign(data, privateKey);
    }

    return this.signatureService.signWithAlgorithm(data, privateKey, algorithm);
  }

  private async currentKeyAlgorithm(
    didRecord: PublicDidRecord,
  ): Promise<SupportedSignatureAlgorithm> {
    const currentKey = await this.findPublicKeyByVersion(
      didRecord.id,
      didRecord.currentKeyVersion,
    );

    if (!currentKey || currentKey.status !== DidKeyStatus.ACTIVE) {
      throw new ConflictException('Current DID key is not active');
    }

    return this.requireSupportedAlgorithm(currentKey.algorithm);
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
    actorId: string | undefined,
    algorithm: SupportedSignatureAlgorithm,
  ): Promise<DidKeyRotationResult> {
    const keyPair = this.generateKeyPairForAlgorithm(algorithm);

    const encryptedPrivateKey = this.encryptionService.encryptForDid(
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
          encryptionKeyId: encryptedPrivateKey.keyId,
          algorithm,
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
    reason: string | undefined,
    algorithm: SupportedSignatureAlgorithm,
  ): Promise<DidKeyRotationResult> {
    const keyPair = this.generateKeyPairForAlgorithm(algorithm);

    const encryptedPrivateKey = this.encryptionService.encryptForDid(
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
          encryptionKeyId: encryptedPrivateKey.keyId,
          algorithm,
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
    algorithm: SupportedSignatureAlgorithm,
  ): Promise<PublicDidRecord> {
    const keyPair = this.generateKeyPairForAlgorithm(algorithm);

    const encryptedPrivateKey = this.encryptionService.encryptForDid(
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
          encryptionKeyId: encryptedPrivateKey.keyId,
          algorithm,
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
