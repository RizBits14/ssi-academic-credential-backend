import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { EncryptionService } from '../crypto/encryption.service';
import { SignatureService } from '../crypto/signature.service';
import {
  DidKeyStatus,
  DidOwnerType,
  DidStatus,
  UserRole,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { DidService } from './did.service';

describe('DidService client-controlled holder key safety', () => {
  const prisma = {
    user: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    did: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    didKey: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };
  const encryption = {
    decryptForDid: jest.fn<(...args: unknown[]) => string>(),
    encryptForDid: jest.fn<(...args: unknown[]) => unknown>(),
  };
  const signature = {
    sign: jest.fn<(...args: unknown[]) => string>(),
    generateKeyPair: jest.fn<(...args: unknown[]) => unknown>(),
  };
  let service: DidService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      id: 'holder-id',
      role: UserRole.HOLDER,
    });
    prisma.did.findUnique.mockResolvedValue({
      id: 'did-id',
      did: 'did:mock:holder:123',
      ownerType: DidOwnerType.USER,
      ownerId: 'holder-id',
      currentKeyVersion: 1,
      status: DidStatus.ACTIVE,
    });
    prisma.didKey.findUnique.mockResolvedValue({
      version: 1,
      algorithm: 'Ed25519',
      status: DidKeyStatus.ACTIVE,
      publicKey: 'PUBLIC_KEY',
      encryptedPrivateKey: null,
      iv: null,
      authTag: null,
      encryptionKeyId: null,
    });
    service = new DidService(
      prisma as unknown as PrismaService,
      encryption as unknown as EncryptionService,
      signature as unknown as SignatureService,
    );
  });

  it('refuses backend signing for a client-controlled DID', async () => {
    await expect(
      service.signForUser('holder-id', 'message'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(encryption.decryptForDid).not.toHaveBeenCalled();
    expect(signature.sign).not.toHaveBeenCalled();
  });

  it('refuses backend key rotation for a client-controlled DID', async () => {
    await expect(service.rotateForUser('holder-id')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(encryption.encryptForDid).not.toHaveBeenCalled();
  });

  it('refuses backend key recovery for a client-controlled DID', async () => {
    await expect(service.recoverForUser('holder-id')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(encryption.encryptForDid).not.toHaveBeenCalled();
  });
});
