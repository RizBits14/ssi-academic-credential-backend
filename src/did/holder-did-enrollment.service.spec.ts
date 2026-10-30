import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  DidKeyStatus,
  DidOwnerType,
  DidStatus,
  UserRole,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { HolderDidEnrollmentService } from './holder-did-enrollment.service';
import { HolderKeyProofService } from './holder-key-proof.service';

describe('HolderDidEnrollmentService', () => {
  const transaction = {
    did: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    didKey: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    auditLog: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const prisma = {
    user: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    did: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };

  const keyProof = {
    begin: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    verifyAndConsume: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  let service: HolderDidEnrollmentService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      id: 'holder-id',
      role: UserRole.HOLDER,
    });
    prisma.did.findUnique.mockResolvedValue(null);
    service = new HolderDidEnrollmentService(
      prisma as unknown as PrismaService,
      keyProof as unknown as HolderKeyProofService,
    );
  });

  it('begins proof only for the authenticated eligible holder', async () => {
    keyProof.begin.mockResolvedValue({ challengeId: 'challenge-id' });

    await service.begin('holder-id', 'PUBLIC_KEY');

    expect(keyProof.begin).toHaveBeenCalledWith({
      holderId: 'holder-id',
      publicKeyPem: 'PUBLIC_KEY',
    });
  });

  it('stores only the client public key and audits enrollment', async () => {
    keyProof.verifyAndConsume.mockResolvedValue({
      publicKeyPem: 'PUBLIC_KEY',
    });

    transaction.did.create.mockImplementation((args: unknown) => {
      const data = (args as { data: { did: string } }).data;

      return Promise.resolve({
        id: 'did-id',
        did: data.did,
        ownerType: DidOwnerType.USER,
        ownerId: 'holder-id',
        currentKeyVersion: 1,
        status: DidStatus.ACTIVE,
      });
    });

    transaction.didKey.create.mockResolvedValue({ id: 'key-id' });
    transaction.auditLog.create.mockResolvedValue({ id: 'audit-id' });

    const result = await service.complete(
      'holder-id',
      'challenge-id',
      'signature',
    );

    expect(keyProof.verifyAndConsume).toHaveBeenCalledWith({
      holderId: 'holder-id',
      challengeId: 'challenge-id',
      signature: 'signature',
    });

    expect(transaction.didKey.create).toHaveBeenCalledWith({
      data: {
        didId: 'did-id',
        version: 1,
        publicKey: 'PUBLIC_KEY',
        encryptedPrivateKey: null,
        iv: null,
        authTag: null,
        encryptionKeyId: null,
        algorithm: 'Ed25519',
        status: DidKeyStatus.ACTIVE,
      },
    });

    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'holder-id',
        action: 'DID_CREATED',
        resourceType: 'DID',
        resourceId: 'did-id',
        metadata: {
          did: expect.stringMatching(/^did:mock:holder:/),
          ownerType: DidOwnerType.USER,
          ownerId: 'holder-id',
          keyVersion: 1,
          keyCustody: 'CLIENT',
          publicKeySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      },
    });

    expect(result).toEqual(expect.objectContaining({ ownerId: 'holder-id' }));
  });

  it('rejects an existing DID without consuming a challenge', async () => {
    prisma.did.findUnique.mockResolvedValue({ id: 'existing-did' });

    await expect(
      service.complete('holder-id', 'challenge-id', 'signature'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(keyProof.verifyAndConsume).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects non-holder account enrollment', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'issuer-id',
      role: UserRole.ISSUER_ADMIN,
    });

    await expect(
      service.begin('issuer-id', 'PUBLIC_KEY'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(keyProof.begin).not.toHaveBeenCalled();
  });

  it('rejects enrollment for a deleted account', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.begin('deleted-id', 'PUBLIC_KEY'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('handles concurrent duplicate enrollment as a conflict', async () => {
    keyProof.verifyAndConsume.mockResolvedValue({
      publicKeyPem: 'PUBLIC_KEY',
    });

    transaction.did.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.complete('holder-id', 'challenge-id', 'signature'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.didKey.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('propagates an audit failure for transaction rollback', async () => {
    keyProof.verifyAndConsume.mockResolvedValue({
      publicKeyPem: 'PUBLIC_KEY',
    });

    transaction.did.create.mockResolvedValue({
      id: 'did-id',
      did: 'did:mock:holder:123',
    });

    transaction.didKey.create.mockResolvedValue({ id: 'key-id' });
    transaction.auditLog.create.mockRejectedValue(
      new Error('Audit storage unavailable'),
    );

    await expect(
      service.complete('holder-id', 'challenge-id', 'signature'),
    ).rejects.toThrow('Audit storage unavailable');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
