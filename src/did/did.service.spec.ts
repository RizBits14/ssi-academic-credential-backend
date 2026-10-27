import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

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
import { DidService } from './did.service';

const VALID_ED25519_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAHR+8ycqBiMz3us9BWUcvtWHuQ//OkYlGMLXq00CKcNo=
-----END PUBLIC KEY-----
`;

const VALID_ED25519_PUBLIC_KEY_MULTIBASE =
  'z6MkgQwwKwDwbL7FKfhzEifRHxNCwq27TM7AWrtkhu4Npa41';

describe('DidService', () => {
  const transactionClient = {
    did: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
    },
    didKey: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
    },
    auditLog: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const mockPrisma = {
    organization: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    user: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    did: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    didKey: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    $transaction: jest.fn(
      async (
        callback: (transaction: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    ),
  };

  const mockEncryptionService = {
    encryptForDid: jest.fn(() => ({
      ciphertext: 'encrypted-private-key',
      iv: 'test-iv',
      authTag: 'test-auth-tag',
      keyId: 'v1',
    })),
    decryptForDid: jest.fn(() => 'PRIVATE_KEY'),
  };

  const mockSignatureService = {
    generateKeyPair: jest.fn(() => ({
      publicKey: 'PUBLIC_KEY',
      privateKey: 'PRIVATE_KEY',
    })),

    sign: jest.fn<(data: string | Buffer, privateKey: string) => string>(
      () => 'signature',
    ),
  };

  let service: DidService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new DidService(
      mockPrisma as unknown as PrismaService,
      mockEncryptionService as unknown as EncryptionService,
      mockSignatureService as unknown as SignatureService,
    );
  });

  it('should create a university DID with a separate initial DID key', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      type: OrganizationType.UNIVERSITY,
      status: OrganizationStatus.ACTIVE,
    });

    mockPrisma.did.findUnique.mockResolvedValue(null);

    transactionClient.did.create.mockImplementation((...args: unknown[]) => {
      const [input] = args as [
        {
          data: Record<string, unknown>;
        },
      ];

      return Promise.resolve({
        id: 'did-record-id',
        did: input.data.did,
        ownerType: input.data.ownerType,
        ownerId: input.data.ownerId,
        currentKeyVersion: input.data.currentKeyVersion,
        status: input.data.status,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    transactionClient.didKey.create.mockResolvedValue({
      id: 'did-key-id',
    });

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.createForOrganization('university-id');

    expect(result.did).toMatch(/^did:mock:university:/);
    expect(result.currentKeyVersion).toBe(1);

    expect(transactionClient.didKey.create).toHaveBeenCalledWith({
      data: {
        didId: 'did-record-id',
        version: 1,
        publicKey: 'PUBLIC_KEY',
        encryptedPrivateKey: 'encrypted-private-key',
        iv: 'test-iv',
        authTag: 'test-auth-tag',
        encryptionKeyId: 'v1',
        algorithm: 'Ed25519',
        status: DidKeyStatus.ACTIVE,
      },
    });

    expect(result).not.toHaveProperty('encryptedPrivateKey');
  });

  it('should reject DID creation for an inactive organization', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      type: OrganizationType.UNIVERSITY,
      status: OrganizationStatus.SUSPENDED,
    });

    await expect(
      service.createForOrganization('university-id'),
    ).rejects.toThrow('Organization is not active');

    expect(mockPrisma.did.findUnique).not.toHaveBeenCalled();
  });

  it('should create a user DID only for a holder', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'holder-id',
      role: UserRole.HOLDER,
    });

    mockPrisma.did.findUnique.mockResolvedValue(null);

    transactionClient.did.create.mockResolvedValue({
      id: 'holder-did-id',
      did: 'did:mock:holder:123',
      ownerType: DidOwnerType.USER,
      ownerId: 'holder-id',
      currentKeyVersion: 1,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    transactionClient.didKey.create.mockResolvedValue({
      id: 'holder-key-id',
    });

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    await expect(service.createForUser('holder-id')).resolves.toEqual(
      expect.objectContaining({
        did: 'did:mock:holder:123',
        currentKeyVersion: 1,
      }),
    );
  });

  it('should reject user DID creation for a non-holder', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'issuer-admin-id',
      role: UserRole.ISSUER_ADMIN,
    });

    await expect(service.createForUser('issuer-admin-id')).rejects.toThrow(
      'Only holders can have user DIDs',
    );
  });

  it('should use the composite owner uniqueness lookup', async () => {
    mockPrisma.did.findUnique.mockResolvedValue(null);

    await service.findPublicByOwner(DidOwnerType.ORGANIZATION, 'university-id');

    expect(mockPrisma.did.findUnique).toHaveBeenCalledWith({
      where: {
        ownerType_ownerId: {
          ownerType: DidOwnerType.ORGANIZATION,
          ownerId: 'university-id',
        },
      },
      select: {
        id: true,
        did: true,
        ownerType: true,
        ownerId: true,
        currentKeyVersion: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it('should resolve the current active key in a DID document', async () => {
    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:holder:123',
      ownerType: DidOwnerType.USER,
      ownerId: 'holder-id',
      currentKeyVersion: 2,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.didKey.findUnique.mockResolvedValue({
      id: 'key-2-id',
      didId: 'did-record-id',
      version: 2,
      publicKey: VALID_ED25519_PUBLIC_KEY,
      algorithm: 'Ed25519',
      status: DidKeyStatus.ACTIVE,
      createdAt: new Date(),
      retiredAt: null,
      revokedAt: null,
    });

    const result = await service.resolveDid('did:mock:holder:123');

    expect(result).toEqual({
      id: 'did:mock:holder:123',
      controller: 'did:mock:holder:123',
      verificationMethod: {
        id: 'did:mock:holder:123#key-2',
        type: 'Multikey',
        controller: 'did:mock:holder:123',
        publicKeyMultibase: VALID_ED25519_PUBLIC_KEY_MULTIBASE,
        publicKey: VALID_ED25519_PUBLIC_KEY,
      },
      status: DidStatus.ACTIVE,
    });
  });

  it('should resolve a retired historical key for old proof verification', async () => {
    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:university:123',
      ownerType: DidOwnerType.ORGANIZATION,
      ownerId: 'university-id',
      currentKeyVersion: 2,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.didKey.findUnique.mockResolvedValue({
      id: 'key-1-id',
      didId: 'did-record-id',
      version: 1,
      publicKey: VALID_ED25519_PUBLIC_KEY,
      algorithm: 'Ed25519',
      status: DidKeyStatus.RETIRED,
      createdAt: new Date(),
      retiredAt: new Date(),
      revokedAt: null,
    });

    const result = await service.resolveVerificationMethod(
      'did:mock:university:123',
      'did:mock:university:123#key-1',
    );

    expect(result.verificationMethod).toEqual({
      id: 'did:mock:university:123#key-1',
      type: 'Multikey',
      controller: 'did:mock:university:123',
      publicKeyMultibase: VALID_ED25519_PUBLIC_KEY_MULTIBASE,
      publicKey: VALID_ED25519_PUBLIC_KEY,
    });
  });

  it('should reject a revoked historical verification key', async () => {
    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:university:123',
      ownerType: DidOwnerType.ORGANIZATION,
      ownerId: 'university-id',
      currentKeyVersion: 2,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.didKey.findUnique.mockResolvedValue({
      id: 'key-1-id',
      didId: 'did-record-id',
      version: 1,
      publicKey: 'PUBLIC_KEY_1',
      algorithm: 'Ed25519',
      status: DidKeyStatus.REVOKED,
      createdAt: new Date(),
      retiredAt: new Date(),
      revokedAt: new Date(),
    });

    await expect(
      service.resolveVerificationMethod(
        'did:mock:university:123',
        'did:mock:university:123#key-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should reject a verification method belonging to another DID', async () => {
    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:holder:123',
      ownerType: DidOwnerType.USER,
      ownerId: 'holder-id',
      currentKeyVersion: 2,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.resolveVerificationMethod(
        'did:mock:holder:123',
        'did:mock:holder:other#key-1',
      ),
    ).rejects.toThrow('DID verification method not found');

    expect(mockPrisma.didKey.findUnique).not.toHaveBeenCalled();
  });

  it('should sign only with the current active organization key', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      status: OrganizationStatus.ACTIVE,
    });

    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:university:123',
      ownerType: DidOwnerType.ORGANIZATION,
      ownerId: 'university-id',
      currentKeyVersion: 2,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.didKey.findUnique.mockResolvedValue({
      publicKey: 'PUBLIC_KEY_2',
      encryptedPrivateKey: 'encrypted-private-key',
      iv: 'test-iv',
      authTag: 'test-auth-tag',
      encryptionKeyId: 'v1',
      algorithm: 'Ed25519',
      version: 2,
      status: DidKeyStatus.ACTIVE,
    });

    const result = await service.signForOrganization(
      'university-id',
      'credential-payload',
    );

    expect(result).toEqual({
      did: 'did:mock:university:123',
      keyVersion: 2,
      signature: 'signature',
    });
  });

  it('should support binary Ed25519 signing payloads', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      status: OrganizationStatus.ACTIVE,
    });

    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:university:123',
      ownerType: DidOwnerType.ORGANIZATION,
      ownerId: 'university-id',
      currentKeyVersion: 2,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.didKey.findUnique.mockResolvedValue({
      publicKey: VALID_ED25519_PUBLIC_KEY,
      encryptedPrivateKey: 'encrypted-private-key',
      iv: 'test-iv',
      authTag: 'test-auth-tag',
      encryptionKeyId: 'v1',
      algorithm: 'Ed25519',
      version: 2,
      status: DidKeyStatus.ACTIVE,
    });

    const signingPayload = Buffer.alloc(64, 0xab);

    const result = await service.signForOrganization(
      'university-id',
      signingPayload,
    );

    expect(mockSignatureService.sign).toHaveBeenCalledWith(
      signingPayload,
      'PRIVATE_KEY',
    );

    expect(result).toEqual({
      did: 'did:mock:university:123',
      keyVersion: 2,
      signature: 'signature',
    });
  });

  it('should reject signing with a retired key', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      status: OrganizationStatus.ACTIVE,
    });

    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:university:123',
      ownerType: DidOwnerType.ORGANIZATION,
      ownerId: 'university-id',
      currentKeyVersion: 2,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.didKey.findUnique.mockResolvedValue({
      publicKey: 'PUBLIC_KEY_2',
      encryptedPrivateKey: 'encrypted-private-key',
      iv: 'test-iv',
      authTag: 'test-auth-tag',
      encryptionKeyId: 'v1',
      algorithm: 'Ed25519',
      version: 2,
      status: DidKeyStatus.RETIRED,
    });

    await expect(
      service.signForOrganization('university-id', 'credential-payload'),
    ).rejects.toThrow('Organization DID signing key is not active');

    expect(mockEncryptionService.decryptForDid).not.toHaveBeenCalled();
  });

  it('should rotate an organization key atomically and retire the previous key', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      status: OrganizationStatus.ACTIVE,
    });

    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:university:123',
      ownerType: DidOwnerType.ORGANIZATION,
      ownerId: 'university-id',
      currentKeyVersion: 1,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    transactionClient.did.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionClient.didKey.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionClient.didKey.create.mockResolvedValue({
      id: 'key-2-id',
      didId: 'did-record-id',
      version: 2,
      publicKey: 'PUBLIC_KEY',
      algorithm: 'Ed25519',
      status: DidKeyStatus.ACTIVE,
      createdAt: new Date(),
      retiredAt: null,
      revokedAt: null,
    });

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.rotateForOrganization('university-id');

    expect(transactionClient.did.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'did-record-id',
        status: DidStatus.ACTIVE,
        currentKeyVersion: 1,
      },
      data: {
        currentKeyVersion: 2,
      },
    });

    expect(transactionClient.didKey.updateMany).toHaveBeenCalledWith({
      where: {
        didId: 'did-record-id',
        version: 1,
        status: DidKeyStatus.ACTIVE,
      },
      data: {
        status: DidKeyStatus.RETIRED,
        retiredAt: expect.any(Date),
      },
    });

    expect(result).toEqual({
      did: 'did:mock:university:123',
      keyVersion: 2,
      verificationMethod: 'did:mock:university:123#key-2',
      publicKey: 'PUBLIC_KEY',
    });
  });

  it('should reject a concurrent stale key rotation', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      status: OrganizationStatus.ACTIVE,
    });

    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:university:123',
      ownerType: DidOwnerType.ORGANIZATION,
      ownerId: 'university-id',
      currentKeyVersion: 1,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    transactionClient.did.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.rotateForOrganization('university-id'),
    ).rejects.toThrow('DID key has already been rotated');

    expect(transactionClient.didKey.updateMany).not.toHaveBeenCalled();
    expect(transactionClient.didKey.create).not.toHaveBeenCalled();
    expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
  });

  it('should revoke a retired historical organization key', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      status: OrganizationStatus.ACTIVE,
    });

    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:university:123',
      ownerType: DidOwnerType.ORGANIZATION,
      ownerId: 'university-id',
      currentKeyVersion: 2,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.didKey.findUnique.mockResolvedValue({
      id: 'key-1-id',
      didId: 'did-record-id',
      version: 1,
      publicKey: 'PUBLIC_KEY_1',
      algorithm: 'Ed25519',
      status: DidKeyStatus.RETIRED,
      createdAt: new Date(),
      retiredAt: new Date(),
      revokedAt: null,
    });

    transactionClient.didKey.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.revokeHistoricalKeyForOrganization(
      'university-id',
      1,
      'issuer-admin-id',
      'Key compromise discovered',
    );

    expect(transactionClient.didKey.updateMany).toHaveBeenCalledWith({
      where: {
        didId: 'did-record-id',
        version: 1,
        status: DidKeyStatus.RETIRED,
      },
      data: {
        status: DidKeyStatus.REVOKED,
        revokedAt: expect.any(Date),
      },
    });

    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'issuer-admin-id',
        organizationId: 'university-id',
        action: 'DID_KEY_REVOKED',
        resourceType: 'DID',
        resourceId: 'did-record-id',
        metadata: {
          did: 'did:mock:university:123',
          ownerType: DidOwnerType.ORGANIZATION,
          ownerId: 'university-id',
          keyVersion: 1,
          reason: 'Key compromise discovered',
        },
      },
    });

    expect(result).toEqual({
      did: 'did:mock:university:123',
      keyVersion: 1,
      verificationMethod: 'did:mock:university:123#key-1',
      status: DidKeyStatus.REVOKED,
      revokedAt: expect.any(Date),
    });
  });

  it('should require recovery instead of directly revoking the current key', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      status: OrganizationStatus.ACTIVE,
    });

    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:university:123',
      ownerType: DidOwnerType.ORGANIZATION,
      ownerId: 'university-id',
      currentKeyVersion: 2,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.revokeHistoricalKeyForOrganization(
        'university-id',
        2,
        'issuer-admin-id',
      ),
    ).rejects.toThrow('Current DID key must be recovered instead of revoked');

    expect(mockPrisma.didKey.findUnique).not.toHaveBeenCalled();
    expect(transactionClient.didKey.updateMany).not.toHaveBeenCalled();
    expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
  });

  it('should reject re-revoking an already revoked historical key', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      status: OrganizationStatus.ACTIVE,
    });

    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:university:123',
      ownerType: DidOwnerType.ORGANIZATION,
      ownerId: 'university-id',
      currentKeyVersion: 2,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.didKey.findUnique.mockResolvedValue({
      id: 'key-1-id',
      didId: 'did-record-id',
      version: 1,
      publicKey: 'PUBLIC_KEY_1',
      algorithm: 'Ed25519',
      status: DidKeyStatus.REVOKED,
      createdAt: new Date(),
      retiredAt: new Date(),
      revokedAt: new Date(),
    });

    await expect(
      service.revokeHistoricalKeyForOrganization(
        'university-id',
        1,
        'issuer-admin-id',
      ),
    ).rejects.toThrow('DID key is already revoked');

    expect(transactionClient.didKey.updateMany).not.toHaveBeenCalled();
  });

  it('should recover a compromised current organization key atomically', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      status: OrganizationStatus.ACTIVE,
    });

    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:university:123',
      ownerType: DidOwnerType.ORGANIZATION,
      ownerId: 'university-id',
      currentKeyVersion: 2,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    transactionClient.did.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionClient.didKey.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionClient.didKey.create.mockResolvedValue({
      id: 'key-3-id',
      didId: 'did-record-id',
      version: 3,
      publicKey: 'PUBLIC_KEY',
      algorithm: 'Ed25519',
      status: DidKeyStatus.ACTIVE,
      createdAt: new Date(),
      retiredAt: null,
      revokedAt: null,
    });

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.recoverForOrganization(
      'university-id',
      'issuer-admin-id',
      'Current signing key was compromised',
    );

    expect(transactionClient.did.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'did-record-id',
        status: DidStatus.ACTIVE,
        currentKeyVersion: 2,
      },
      data: {
        currentKeyVersion: 3,
      },
    });

    expect(transactionClient.didKey.updateMany).toHaveBeenCalledWith({
      where: {
        didId: 'did-record-id',
        version: 2,
        status: DidKeyStatus.ACTIVE,
      },
      data: {
        status: DidKeyStatus.REVOKED,
        revokedAt: expect.any(Date),
      },
    });

    expect(transactionClient.didKey.create).toHaveBeenCalledWith({
      data: {
        didId: 'did-record-id',
        version: 3,
        publicKey: 'PUBLIC_KEY',
        encryptedPrivateKey: 'encrypted-private-key',
        iv: 'test-iv',
        authTag: 'test-auth-tag',
        encryptionKeyId: 'v1',
        algorithm: 'Ed25519',
        status: DidKeyStatus.ACTIVE,
      },
      select: {
        id: true,
        didId: true,
        version: true,
        publicKey: true,
        algorithm: true,
        status: true,
        createdAt: true,
        retiredAt: true,
        revokedAt: true,
      },
    });

    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'issuer-admin-id',
        organizationId: 'university-id',
        action: 'DID_KEY_RECOVERED',
        resourceType: 'DID',
        resourceId: 'did-record-id',
        metadata: {
          did: 'did:mock:university:123',
          ownerType: DidOwnerType.ORGANIZATION,
          ownerId: 'university-id',
          compromisedKeyVersion: 2,
          newKeyVersion: 3,
          reason: 'Current signing key was compromised',
        },
      },
    });

    expect(result).toEqual({
      did: 'did:mock:university:123',
      keyVersion: 3,
      verificationMethod: 'did:mock:university:123#key-3',
      publicKey: 'PUBLIC_KEY',
    });
  });

  it('should reject a concurrent stale recovery', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      status: OrganizationStatus.ACTIVE,
    });

    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:university:123',
      ownerType: DidOwnerType.ORGANIZATION,
      ownerId: 'university-id',
      currentKeyVersion: 2,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    transactionClient.did.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.recoverForOrganization(
        'university-id',
        'issuer-admin-id',
        'Compromised key',
      ),
    ).rejects.toThrow('DID key has already changed');

    expect(transactionClient.didKey.updateMany).not.toHaveBeenCalled();
    expect(transactionClient.didKey.create).not.toHaveBeenCalled();
    expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
  });

  it('should reject verification methods when the DID itself is not active', async () => {
    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:holder:123',
      ownerType: DidOwnerType.USER,
      ownerId: 'holder-id',
      currentKeyVersion: 1,
      status: DidStatus.REVOKED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.resolveVerificationMethod(
        'did:mock:holder:123',
        'did:mock:holder:123#key-1',
      ),
    ).rejects.toThrow('DID verification method not found');

    expect(mockPrisma.didKey.findUnique).not.toHaveBeenCalled();
  });

  it('should reject resolving an unsupported key algorithm', async () => {
    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:holder:123',
      ownerType: DidOwnerType.USER,
      ownerId: 'holder-id',
      currentKeyVersion: 1,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.didKey.findUnique.mockResolvedValue({
      id: 'key-1-id',
      didId: 'did-record-id',
      version: 1,
      publicKey: 'PUBLIC_KEY',
      algorithm: 'UnsupportedAlgorithm',
      status: DidKeyStatus.ACTIVE,
      createdAt: new Date(),
      retiredAt: null,
      revokedAt: null,
    });

    await expect(
      service.resolveDid('did:mock:holder:123'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
