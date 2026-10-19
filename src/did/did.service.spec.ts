import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

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
import { DidService } from './did.service';

describe('DidService', () => {
  const transactionClient = {
    did: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
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
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    $transaction: jest.fn(
      async (
        callback: (transaction: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    ),
  };

  const mockEncryptionService = {
    encrypt: jest.fn(() => ({
      ciphertext: 'encrypted-private-key',
      iv: 'test-iv',
      authTag: 'test-auth-tag',
    })),
    decrypt: jest.fn(() => 'PRIVATE_KEY'),
  };

  const mockSignatureService = {
    generateKeyPair: jest.fn(() => ({
      publicKey: 'PUBLIC_KEY',
      privateKey: 'PRIVATE_KEY',
    })),
    sign: jest.fn(() => 'signature'),
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

  it('should create an active university DID without returning private-key material', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      type: OrganizationType.UNIVERSITY,
      status: OrganizationStatus.ACTIVE,
    });

    mockPrisma.did.findFirst.mockResolvedValue(null);

    transactionClient.did.create.mockImplementation((...args: unknown[]) => {
      const [input] = args as [
        {
          data: Record<string, unknown>;
          select: Record<string, boolean>;
        },
      ];

      expect(input.select).not.toHaveProperty('encryptedPrivateKey');
      expect(input.select).not.toHaveProperty('iv');
      expect(input.select).not.toHaveProperty('authTag');

      return Promise.resolve({
        id: 'did-record-id',
        did: input.data.did,
        ownerType: input.data.ownerType,
        ownerId: input.data.ownerId,
        publicKey: input.data.publicKey,
        algorithm: input.data.algorithm,
        keyVersion: input.data.keyVersion,
        status: input.data.status,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    transactionClient.auditLog.create.mockResolvedValue({ id: 'audit-id' });

    const result = await service.createForOrganization('university-id');

    expect(result.did).toMatch(/^did:mock:university:/);
    expect(result.ownerType).toBe(DidOwnerType.ORGANIZATION);
    expect(result).not.toHaveProperty('encryptedPrivateKey');
    expect(result).not.toHaveProperty('iv');
    expect(result).not.toHaveProperty('authTag');
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

    expect(mockPrisma.did.findFirst).not.toHaveBeenCalled();
  });

  it('should create a holder DID only for a holder user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'holder-id',
      role: UserRole.HOLDER,
    });

    mockPrisma.did.findFirst.mockResolvedValue(null);

    transactionClient.did.create.mockImplementation((...args: unknown[]) => {
      const [input] = args as [{ data: Record<string, unknown> }];

      return Promise.resolve({
        id: 'holder-did-record-id',
        did: input.data.did,
        ownerType: input.data.ownerType,
        ownerId: input.data.ownerId,
        publicKey: input.data.publicKey,
        algorithm: input.data.algorithm,
        keyVersion: input.data.keyVersion,
        status: input.data.status,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    transactionClient.auditLog.create.mockResolvedValue({ id: 'audit-id' });

    const result = await service.createForUser('holder-id');

    expect(result.did).toMatch(/^did:mock:holder:/);
    expect(result.ownerType).toBe(DidOwnerType.USER);
    expect(result).not.toHaveProperty('encryptedPrivateKey');
    expect(result).not.toHaveProperty('iv');
    expect(result).not.toHaveProperty('authTag');
  });

  it('should reject user DID creation for a non-holder user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'issuer-admin-id',
      role: UserRole.ISSUER_ADMIN,
    });

    await expect(service.createForUser('issuer-admin-id')).rejects.toThrow(
      'Only holders can have user DIDs',
    );

    expect(mockPrisma.did.findFirst).not.toHaveBeenCalled();
  });

  it('should reject creating a second DID for the same organization', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      type: OrganizationType.UNIVERSITY,
      status: OrganizationStatus.ACTIVE,
    });

    mockPrisma.did.findFirst.mockResolvedValue({
      id: 'existing-did-id',
      did: 'did:mock:university:existing',
      status: DidStatus.ACTIVE,
    });

    await expect(
      service.createForOrganization('university-id'),
    ).rejects.toThrow('Organization already has a DID');
  });

  it('should resolve a DID with the DID itself as controller', async () => {
    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:holder:123',
      ownerType: DidOwnerType.USER,
      ownerId: 'internal-user-id',
      publicKey: 'PUBLIC_KEY',
      algorithm: 'Ed25519',
      keyVersion: 3,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.resolveDid('did:mock:holder:123');

    expect(result).toEqual({
      id: 'did:mock:holder:123',
      controller: 'did:mock:holder:123',
      verificationMethod: {
        id: 'did:mock:holder:123#key-3',
        type: 'Ed25519VerificationKey',
        publicKey: 'PUBLIC_KEY',
      },
      status: DidStatus.ACTIVE,
    });
  });

  it('should use a public-only projection for public DID lookup', async () => {
    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:university:123',
      ownerType: DidOwnerType.ORGANIZATION,
      ownerId: 'university-id',
      publicKey: 'PUBLIC_KEY',
      algorithm: 'Ed25519',
      keyVersion: 1,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.findPublicByDid('did:mock:university:123');

    expect(mockPrisma.did.findUnique).toHaveBeenCalledWith({
      where: {
        did: 'did:mock:university:123',
      },
      select: {
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
      },
    });
  });

  it('should sign for an active organization with an active Ed25519 DID', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      status: OrganizationStatus.ACTIVE,
    });

    mockPrisma.did.findFirst.mockResolvedValue({
      did: 'did:mock:university:123',
      encryptedPrivateKey: 'encrypted-private-key',
      iv: 'test-iv',
      authTag: 'test-auth-tag',
      algorithm: 'Ed25519',
      keyVersion: 2,
      status: DidStatus.ACTIVE,
    });

    const result = await service.signForOrganization(
      'university-id',
      'credential-payload',
    );

    expect(mockEncryptionService.decrypt).toHaveBeenCalledWith({
      ciphertext: 'encrypted-private-key',
      iv: 'test-iv',
      authTag: 'test-auth-tag',
    });

    expect(mockSignatureService.sign).toHaveBeenCalledWith(
      'credential-payload',
      'PRIVATE_KEY',
    );

    expect(result).toEqual({
      did: 'did:mock:university:123',
      keyVersion: 2,
      signature: 'signature',
    });
  });

  it('should reject organization signing when the organization is inactive', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      status: OrganizationStatus.SUSPENDED,
    });

    await expect(
      service.signForOrganization('university-id', 'credential-payload'),
    ).rejects.toThrow('Organization is not active');

    expect(mockPrisma.did.findFirst).not.toHaveBeenCalled();
  });

  it('should reject signing with an unsupported organization DID algorithm', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      status: OrganizationStatus.ACTIVE,
    });

    mockPrisma.did.findFirst.mockResolvedValue({
      did: 'did:mock:university:123',
      encryptedPrivateKey: 'encrypted-private-key',
      iv: 'test-iv',
      authTag: 'test-auth-tag',
      algorithm: 'UnsupportedAlgorithm',
      keyVersion: 1,
      status: DidStatus.ACTIVE,
    });

    await expect(
      service.signForOrganization('university-id', 'credential-payload'),
    ).rejects.toThrow('Organization DID algorithm is not supported');

    expect(mockEncryptionService.decrypt).not.toHaveBeenCalled();
    expect(mockSignatureService.sign).not.toHaveBeenCalled();
  });

  it('should sign for a holder with an active Ed25519 DID', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'holder-id',
      role: UserRole.HOLDER,
    });

    mockPrisma.did.findFirst.mockResolvedValue({
      did: 'did:mock:holder:123',
      encryptedPrivateKey: 'encrypted-private-key',
      iv: 'test-iv',
      authTag: 'test-auth-tag',
      algorithm: 'Ed25519',
      keyVersion: 1,
      status: DidStatus.ACTIVE,
    });

    const result = await service.signForUser(
      'holder-id',
      'presentation-payload',
    );

    expect(result).toEqual({
      did: 'did:mock:holder:123',
      keyVersion: 1,
      signature: 'signature',
    });
  });

  it('should reject user signing for a non-holder user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'verifier-admin-id',
      role: UserRole.VERIFIER_ADMIN,
    });

    await expect(
      service.signForUser('verifier-admin-id', 'presentation-payload'),
    ).rejects.toThrow('Only holders can sign with user DIDs');

    expect(mockPrisma.did.findFirst).not.toHaveBeenCalled();
  });

  it('should reject resolving a DID with an unsupported algorithm', async () => {
    mockPrisma.did.findUnique.mockResolvedValue({
      id: 'did-record-id',
      did: 'did:mock:holder:123',
      ownerType: DidOwnerType.USER,
      ownerId: 'holder-id',
      publicKey: 'PUBLIC_KEY',
      algorithm: 'UnsupportedAlgorithm',
      keyVersion: 1,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.resolveDid('did:mock:holder:123'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
