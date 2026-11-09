import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createHash,
  createPublicKey,
  randomBytes,
  randomUUID,
  verify as cryptoVerify,
} from 'node:crypto';

import { RedisService } from '../redis/redis.service';

interface HolderKeyChallengeSession {
  holderId: string;
  publicKeyPem: string;
  message: string;
  expiresAt: string;
}

interface BeginHolderKeyProofInput {
  holderId: string;
  publicKeyPem: string;
}

interface CompleteHolderKeyProofInput {
  holderId: string;
  challengeId: string;
  signature: string;
}

@Injectable()
export class HolderKeyProofService {
  private readonly challengeTtlSeconds = 300;

  private readonly challengePrefix = 'holder-key-proof:';

  constructor(private readonly redis: RedisService) {}

  async begin(input: BeginHolderKeyProofInput) {
    if (!input.holderId?.trim()) {
      throw new BadRequestException('Holder ID is required');
    }

    const publicKeyPem = this.normalizeEd25519PublicKey(input.publicKeyPem);

    const challengeId = randomUUID();
    const nonce = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.challengeTtlSeconds * 1000);

    const publicKeySha256 = createHash('sha256')
      .update(publicKeyPem, 'utf8')
      .digest('hex');

    const message = JSON.stringify({
      type: 'ssi-academic-credential-holder-key-proof-v1',
      purpose: 'holder-key-enrollment',
      holderId: input.holderId,
      challengeId,
      nonce,
      publicKeySha256,
    });

    const session: HolderKeyChallengeSession = {
      holderId: input.holderId,
      publicKeyPem,
      message,
      expiresAt: expiresAt.toISOString(),
    };

    await this.redis.setJson(
      this.challengeKey(challengeId),
      session,
      this.challengeTtlSeconds,
    );

    return {
      challengeId,
      message,
      expiresAt: session.expiresAt,
    };
  }

  async verifyAndConsume(
    input: CompleteHolderKeyProofInput,
  ): Promise<{ publicKeyPem: string }> {
    if (!input.holderId?.trim()) {
      throw new BadRequestException('Holder ID is required');
    }

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        input.challengeId,
      )
    ) {
      throw new BadRequestException('Invalid key proof challenge ID');
    }

    const signature = this.decodeEd25519Signature(input.signature);

    const key = this.challengeKey(input.challengeId);

    const current = await this.redis.getJson<HolderKeyChallengeSession>(key);

    if (!current) {
      throw new BadRequestException(
        'Key ownership challenge is missing or expired',
      );
    }

    if (current.holderId !== input.holderId) {
      throw new ForbiddenException(
        'Key ownership challenge belongs to another holder',
      );
    }

    const session =
      await this.redis.consumeJson<HolderKeyChallengeSession>(key);

    if (!session) {
      throw new BadRequestException('Key ownership challenge was already used');
    }

    if (session.holderId !== input.holderId) {
      throw new ForbiddenException(
        'Key ownership challenge belongs to another holder',
      );
    }

    const expiresAt = new Date(session.expiresAt);

    if (
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('Key ownership challenge has expired');
    }

    const publicKeyPem = this.normalizeEd25519PublicKey(session.publicKeyPem);

    let isValid = false;

    try {
      isValid = cryptoVerify(
        null,
        Buffer.from(session.message, 'utf8'),
        createPublicKey(publicKeyPem),
        signature,
      );
    } catch {
      isValid = false;
    }

    if (!isValid) {
      throw new UnauthorizedException('Invalid holder key ownership signature');
    }

    return { publicKeyPem };
  }

  private challengeKey(challengeId: string): string {
    return `${this.challengePrefix}${challengeId}`;
  }

  private normalizeEd25519PublicKey(value: string): string {
    if (
      typeof value !== 'string' ||
      value.length > 2048 ||
      !value.trim().startsWith('-----BEGIN PUBLIC KEY-----') ||
      !value.trim().endsWith('-----END PUBLIC KEY-----')
    ) {
      throw new BadRequestException(
        'A valid Ed25519 public key in SPKI PEM format is required',
      );
    }

    try {
      const key = createPublicKey(value);
      const jwk = key.export({ format: 'jwk' });

      if (
        jwk.kty !== 'OKP' ||
        jwk.crv !== 'Ed25519' ||
        typeof jwk.x !== 'string' ||
        Buffer.from(jwk.x, 'base64url').length !== 32
      ) {
        throw new Error('Unsupported key');
      }

      const exportedKey = key.export({
        format: 'pem',
        type: 'spki',
      });

      return typeof exportedKey === 'string'
        ? exportedKey
        : exportedKey.toString('utf8');
    } catch {
      throw new BadRequestException(
        'A valid Ed25519 public key in SPKI PEM format is required',
      );
    }
  }

  private decodeEd25519Signature(value: string): Buffer {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(value)) {
      throw new BadRequestException(
        'Signature must be a base64url-encoded Ed25519 signature',
      );
    }

    const decoded = Buffer.from(value, 'base64url');

    if (decoded.length !== 64 || decoded.toString('base64url') !== value) {
      throw new BadRequestException(
        'Signature must contain exactly 64 Ed25519 signature bytes',
      );
    }

    return decoded;
  }
}
