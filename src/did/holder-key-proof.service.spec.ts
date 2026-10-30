import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';

import { RedisService } from '../redis/redis.service';
import { HolderKeyProofService } from './holder-key-proof.service';

interface StoredChallenge {
  holderId: string;
  publicKeyPem: string;
  message: string;
  expiresAt: string;
}

describe('HolderKeyProofService', () => {
  const mockRedis = {
    setJson: jest.fn<(...args: unknown[]) => Promise<void>>(),
    getJson: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    consumeJson: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  let service: HolderKeyProofService;

  function generateEd25519Keys() {
    return generateKeyPairSync('ed25519', {
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });
  }

  function lastStoredChallenge(): StoredChallenge {
    const call = mockRedis.setJson.mock.calls.at(-1);

    if (!call) {
      throw new Error('Expected a stored key ownership challenge');
    }

    return call[1] as StoredChallenge;
  }

  beforeEach(() => {
    jest.resetAllMocks();

    service = new HolderKeyProofService(mockRedis as unknown as RedisService);
  });

  it('should create a holder-bound challenge with a five-minute TTL', async () => {
    const { publicKey } = generateEd25519Keys();

    const result = await service.begin({
      holderId: 'holder-id',
      publicKeyPem: publicKey,
    });

    expect(result.challengeId).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27,}$/);

    expect(mockRedis.setJson).toHaveBeenCalledWith(
      `holder-key-proof:${result.challengeId}`,
      expect.objectContaining({
        holderId: 'holder-id',
        publicKeyPem: publicKey,
        message: result.message,
        expiresAt: result.expiresAt,
      }),
      300,
    );

    const message = JSON.parse(result.message) as Record<string, string>;

    expect(message).toEqual({
      type: 'ssi-academic-credential-holder-key-proof-v1',
      purpose: 'holder-key-enrollment',
      holderId: 'holder-id',
      challengeId: result.challengeId,
      nonce: expect.any(String),
      publicKeySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });

    expect(message.nonce).toHaveLength(43);
  });

  it('should verify a real client-generated Ed25519 signature', async () => {
    const { publicKey, privateKey } = generateEd25519Keys();

    const challenge = await service.begin({
      holderId: 'holder-id',
      publicKeyPem: publicKey,
    });

    const stored = lastStoredChallenge();

    mockRedis.getJson.mockResolvedValue(stored);
    mockRedis.consumeJson.mockResolvedValue(stored);

    const signature = cryptoSign(
      null,
      Buffer.from(challenge.message, 'utf8'),
      privateKey,
    ).toString('base64url');

    const result = await service.verifyAndConsume({
      holderId: 'holder-id',
      challengeId: challenge.challengeId,
      signature,
    });

    expect(result).toEqual({
      publicKeyPem: publicKey,
    });

    expect(mockRedis.consumeJson).toHaveBeenCalledWith(
      `holder-key-proof:${challenge.challengeId}`,
    );
  });

  it('should reject another holders attempt to consume a challenge', async () => {
    const { publicKey, privateKey } = generateEd25519Keys();

    const challenge = await service.begin({
      holderId: 'first-holder',
      publicKeyPem: publicKey,
    });

    mockRedis.getJson.mockResolvedValue(lastStoredChallenge());

    const signature = cryptoSign(
      null,
      Buffer.from(challenge.message, 'utf8'),
      privateKey,
    ).toString('base64url');

    await expect(
      service.verifyAndConsume({
        holderId: 'different-holder',
        challengeId: challenge.challengeId,
        signature,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(mockRedis.consumeJson).not.toHaveBeenCalled();
  });

  it('should reject a signature from a different private key', async () => {
    const { publicKey } = generateEd25519Keys();
    const otherKeys = generateEd25519Keys();

    const challenge = await service.begin({
      holderId: 'holder-id',
      publicKeyPem: publicKey,
    });

    const stored = lastStoredChallenge();

    mockRedis.getJson.mockResolvedValue(stored);
    mockRedis.consumeJson.mockResolvedValue(stored);

    const wrongSignature = cryptoSign(
      null,
      Buffer.from(challenge.message, 'utf8'),
      otherKeys.privateKey,
    ).toString('base64url');

    await expect(
      service.verifyAndConsume({
        holderId: 'holder-id',
        challengeId: challenge.challengeId,
        signature: wrongSignature,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should reject expired challenges', async () => {
    const { publicKey, privateKey } = generateEd25519Keys();

    const challenge = await service.begin({
      holderId: 'holder-id',
      publicKeyPem: publicKey,
    });

    const expiredSession = {
      ...lastStoredChallenge(),
      expiresAt: '2020-01-01T00:00:00.000Z',
    };

    mockRedis.getJson.mockResolvedValue(expiredSession);
    mockRedis.consumeJson.mockResolvedValue(expiredSession);

    const signature = cryptoSign(
      null,
      Buffer.from(challenge.message, 'utf8'),
      privateKey,
    ).toString('base64url');

    await expect(
      service.verifyAndConsume({
        holderId: 'holder-id',
        challengeId: challenge.challengeId,
        signature,
      }),
    ).rejects.toThrow('Key ownership challenge has expired');
  });

  it('should reject challenge replay after atomic consumption', async () => {
    const { publicKey, privateKey } = generateEd25519Keys();

    const challenge = await service.begin({
      holderId: 'holder-id',
      publicKeyPem: publicKey,
    });

    const stored = lastStoredChallenge();

    mockRedis.getJson.mockResolvedValue(stored);
    mockRedis.consumeJson
      .mockResolvedValueOnce(stored)
      .mockResolvedValueOnce(null);

    const signature = cryptoSign(
      null,
      Buffer.from(challenge.message, 'utf8'),
      privateKey,
    ).toString('base64url');

    const input = {
      holderId: 'holder-id',
      challengeId: challenge.challengeId,
      signature,
    };

    await expect(service.verifyAndConsume(input)).resolves.toEqual({
      publicKeyPem: publicKey,
    });

    await expect(service.verifyAndConsume(input)).rejects.toThrow(
      'Key ownership challenge was already used',
    );
  });

  it('should reject malformed Ed25519 signatures', async () => {
    const { publicKey } = generateEd25519Keys();

    const challenge = await service.begin({
      holderId: 'holder-id',
      publicKeyPem: publicKey,
    });

    await expect(
      service.verifyAndConsume({
        holderId: 'holder-id',
        challengeId: challenge.challengeId,
        signature: 'not-a-valid-signature',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockRedis.consumeJson).not.toHaveBeenCalled();
  });

  it('should reject P-256 public keys for Ed25519 enrollment', async () => {
    const { publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    await expect(
      service.begin({
        holderId: 'holder-id',
        publicKeyPem: publicKey,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockRedis.setJson).not.toHaveBeenCalled();
  });

  it('should reject receiving a private key instead of a public key', async () => {
    const { privateKey } = generateEd25519Keys();

    await expect(
      service.begin({
        holderId: 'holder-id',
        publicKeyPem: privateKey,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockRedis.setJson).not.toHaveBeenCalled();
  });
});
