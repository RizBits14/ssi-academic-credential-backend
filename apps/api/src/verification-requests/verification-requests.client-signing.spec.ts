import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  generateKeyPairSync,
  sign as signEd25519,
  createHash,
} from 'node:crypto';

import {
  DidKeyStatus,
  DidOwnerType,
  DidStatus,
  VerificationRequestStatus,
} from '../generated/prisma/enums';
import { VerificationRequestsService } from './verification-requests.service';

const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function multibaseSignature(signature: Buffer): string {
  let number = 0n;
  for (const byte of signature) number = number * 256n + BigInt(byte);
  let encoded = '';
  while (number > 0n) {
    encoded = alphabet[Number(number % 58n)] + encoded;
    number /= 58n;
  }
  let zeros = 0;
  for (const byte of signature) {
    if (byte !== 0) break;
    zeros += 1;
  }
  return `z${'1'.repeat(zeros)}${encoded}`;
}

describe('VerificationRequestsService client-owned presentation signing', () => {
  const keys = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { format: 'pem', type: 'spki' },
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  });

  const tx = {
    verificationRequest: {
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
    },
    presentation: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    auditLog: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };
  const prisma = {
    verificationRequest: {
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
    },
    walletCredential: {
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    didKey: {
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    $transaction: jest.fn(
      (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const redis = {
    getJson: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    delete: jest.fn<(...args: unknown[]) => Promise<void>>(),
  };
  const encryption = {
    decryptForWallet: jest.fn<(...args: unknown[]) => string>(),
  };
  const did = {
    findPublicByOwner: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    resolveDid: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    signForUser: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  let service: VerificationRequestsService;
  const nonce = 'b'.repeat(64);
  const basicInput = {
    requestId: 'request-id',
    holderId: 'holder-id',
    credentialId: 'credential-id',
    approvedClaims: ['degree'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VerificationRequestsService(
      prisma as never,
      redis as never,
      encryption as never,
      did as never,
    );
    prisma.verificationRequest.findFirst.mockResolvedValue({
      id: 'request-id',
      applicationId: 'application-id',
      holderId: 'holder-id',
      requestedClaims: ['degree', 'cgpa'],
      nonceHash: createHash('sha256').update(nonce).digest('hex'),
      status: VerificationRequestStatus.PENDING,
      expiresAt: new Date(Date.now() + 120_000),
    });
    redis.getJson.mockResolvedValue({
      holderId: 'holder-id',
      applicationId: 'application-id',
      bankId: 'bank-id',
      nonce,
      requestedClaims: ['degree', 'cgpa'],
    });
    prisma.walletCredential.findFirst.mockResolvedValue({
      holderId: 'holder-id',
      credentialId: 'credential-id',
      ciphertext: 'encrypted',
      iv: 'iv',
      authTag: 'auth-tag',
      encryptionKeyId: 'key-id',
    });
    encryption.decryptForWallet.mockReturnValue(
      JSON.stringify({
        issuer: { name: 'University' },
        credentialSubject: { degree: 'BSc', cgpa: 3.75 },
      }),
    );
    did.findPublicByOwner.mockResolvedValue({
      id: 'did-id',
      did: 'did:mock:holder:client',
      ownerId: 'holder-id',
      ownerType: DidOwnerType.USER,
      currentKeyVersion: 1,
      status: DidStatus.ACTIVE,
    });
    prisma.didKey.findFirst.mockResolvedValue({ id: 'key-id' });
    did.resolveDid.mockResolvedValue({
      id: 'did:mock:holder:client',
      verificationMethod: {
        id: 'did:mock:holder:client#key-1',
        publicKey: keys.publicKey,
      },
    });
    tx.verificationRequest.updateMany.mockResolvedValue({ count: 1 });
    tx.presentation.create.mockImplementation((args: unknown) =>
      Promise.resolve({ id: (args as { data: { id: string } }).data.id }),
    );
    tx.auditLog.create.mockResolvedValue({ id: 'audit-id' });
  });

  it('prepares the exact cryptographic signing input without signing on the server', async () => {
    const prepared = await service.prepareClientApproval(basicInput);
    const payload = Buffer.from(prepared.signingPayloadBase64url, 'base64url');
    expect(payload).toHaveLength(64);
    expect(prepared.disclosedClaims).toEqual({ degree: 'BSc' });
    expect(prepared.proofOptions).toEqual(
      expect.objectContaining({
        verificationMethod: 'did:mock:holder:client#key-1',
        challenge: nonce,
        domain: 'bank-id',
        proofPurpose: 'authentication',
      }),
    );
    expect(prisma.didKey.findFirst).toHaveBeenCalledWith({
      where: {
        didId: 'did-id',
        version: 1,
        status: DidKeyStatus.ACTIVE,
        algorithm: 'Ed25519',
        encryptedPrivateKey: null,
        iv: null,
        authTag: null,
      },
      select: { id: true },
    });
    expect(did.signForUser).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('approves a presentation signed using the actual external private key', async () => {
    const prepared = await service.prepareClientApproval(basicInput);
    const signature = signEd25519(
      null,
      Buffer.from(prepared.signingPayloadBase64url, 'base64url'),
      keys.privateKey,
    );
    const result = await service.approveClient({
      ...basicInput,
      presentationId: prepared.presentationId,
      created: prepared.proofOptions.created,
      proofValue: multibaseSignature(signature),
    });
    expect(result.presentationId).toBe(prepared.presentationId);
    expect(tx.presentation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: prepared.presentationId,
        holderDid: 'did:mock:holder:client',
        disclosedClaims: { degree: 'BSc' },
        nonce,
        holderProof: expect.objectContaining({
          proofValue: multibaseSignature(signature),
        }),
      }),
    });
    expect(did.signForUser).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it('rejects signatures over tampered claim selections', async () => {
    const prepared = await service.prepareClientApproval(basicInput);
    const signature = signEd25519(
      null,
      Buffer.from(prepared.signingPayloadBase64url, 'base64url'),
      keys.privateKey,
    );
    await expect(
      service.approveClient({
        ...basicInput,
        approvedClaims: ['cgpa'],
        presentationId: prepared.presentationId,
        created: prepared.proofOptions.created,
        proofValue: multibaseSignature(signature),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.presentation.create).not.toHaveBeenCalled();
  });

  it('rejects a signature from an unrelated private key', async () => {
    const wrongKeys = generateKeyPairSync('ed25519');
    const prepared = await service.prepareClientApproval(basicInput);
    const signature = signEd25519(
      null,
      Buffer.from(prepared.signingPayloadBase64url, 'base64url'),
      wrongKeys.privateKey,
    );
    await expect(
      service.approveClient({
        ...basicInput,
        presentationId: prepared.presentationId,
        created: prepared.proofOptions.created,
        proofValue: multibaseSignature(signature),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.presentation.create).not.toHaveBeenCalled();
  });

  it('blocks server-managed keys from using client signing flow', async () => {
    prisma.didKey.findFirst.mockResolvedValue(null);
    await expect(
      service.prepareClientApproval(basicInput),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects invalid multibase signatures before consuming the request', async () => {
    const prepared = await service.prepareClientApproval(basicInput);
    await expect(
      service.approveClient({
        ...basicInput,
        presentationId: prepared.presentationId,
        created: prepared.proofOptions.created,
        proofValue: 'not-multibase',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('enforces the concurrent pending-to-approved transition', async () => {
    const prepared = await service.prepareClientApproval(basicInput);
    const signature = signEd25519(
      null,
      Buffer.from(prepared.signingPayloadBase64url, 'base64url'),
      keys.privateKey,
    );
    tx.verificationRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.approveClient({
        ...basicInput,
        presentationId: prepared.presentationId,
        created: prepared.proofOptions.created,
        proofValue: multibaseSignature(signature),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.presentation.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects a holder trying to prepare another holders request', async () => {
    prisma.verificationRequest.findFirst.mockResolvedValue(null);
    await expect(
      service.prepareClientApproval({
        ...basicInput,
        holderId: 'attacker-holder',
      }),
    ).rejects.toThrow('Verification request not found');
    expect(prisma.walletCredential.findFirst).not.toHaveBeenCalled();
  });

  it('rejects an expired signing timestamp', async () => {
    await expect(
      service.prepareClientApproval({
        ...basicInput,
        created: '2020-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
