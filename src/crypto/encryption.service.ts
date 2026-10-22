import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type EncryptionDomain = 'did' | 'wallet';

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId: string;
}

export interface StoredEncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId?: string | null;
}

@Injectable()
export class EncryptionService {
  private readonly legacyKey: Buffer;

  private readonly activeKeyIds: Record<EncryptionDomain, string>;

  private readonly keyCache = new Map<string, Buffer>();

  constructor(private readonly configService: ConfigService) {
    this.legacyKey = this.readKey('MASTER_ENCRYPTION_KEY');

    this.activeKeyIds = {
      did: this.readKeyId('DID_ENCRYPTION_ACTIVE_KEY_ID'),
      wallet: this.readKeyId('WALLET_ENCRYPTION_ACTIVE_KEY_ID'),
    };
  }

  encryptForDid(plaintext: string): EncryptedData {
    return this.encryptForDomain(plaintext, 'did');
  }

  decryptForDid(encryptedData: StoredEncryptedData): string {
    return this.decryptForDomain(encryptedData, 'did');
  }

  encryptForWallet(plaintext: string): EncryptedData {
    return this.encryptForDomain(plaintext, 'wallet');
  }

  decryptForWallet(encryptedData: StoredEncryptedData): string {
    return this.decryptForDomain(encryptedData, 'wallet');
  }

  private encryptForDomain(
    plaintext: string,
    domain: EncryptionDomain,
  ): EncryptedData {
    const keyId = this.activeKeyIds[domain];
    const key = this.getDomainKey(domain, keyId);
    const iv = randomBytes(12);

    const cipher = createCipheriv('aes-256-gcm', key, iv);

    cipher.setAAD(this.domainAad(domain));

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      keyId,
    };
  }

  private decryptForDomain(
    encryptedData: StoredEncryptedData,
    domain: EncryptionDomain,
  ): string {
    const keyId = encryptedData.keyId;

    const key = keyId ? this.getDomainKey(domain, keyId) : this.legacyKey;

    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(encryptedData.iv, 'base64'),
    );

    if (keyId) {
      decipher.setAAD(this.domainAad(domain));
    }

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'base64'));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encryptedData.ciphertext, 'base64')),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }

  private getDomainKey(domain: EncryptionDomain, keyId: string): Buffer {
    const cacheKey = `${domain}:${keyId}`;
    const cachedKey = this.keyCache.get(cacheKey);

    if (cachedKey) {
      return cachedKey;
    }

    const environmentKey = `${domain.toUpperCase()}_ENCRYPTION_KEY_${keyId.toUpperCase()}`;
    const key = this.readKey(environmentKey);

    this.keyCache.set(cacheKey, key);

    return key;
  }

  private readKeyId(environmentKey: string): string {
    const keyId = this.configService
      .getOrThrow<string>(environmentKey)
      .trim()
      .toLowerCase();

    if (!/^[a-z0-9_]+$/.test(keyId)) {
      throw new Error(
        `${environmentKey} must contain only letters, numbers, and underscores`,
      );
    }

    return keyId;
  }

  private readKey(environmentKey: string): Buffer {
    const encryptionKey = this.configService.getOrThrow<string>(environmentKey);

    if (!/^[a-fA-F0-9]{64}$/.test(encryptionKey)) {
      throw new Error(`${environmentKey} must be a 32-byte hexadecimal value`);
    }

    return Buffer.from(encryptionKey, 'hex');
  }

  private domainAad(domain: EncryptionDomain): Buffer {
    return Buffer.from(`ssi-academic-credential:${domain}`, 'utf8');
  }
}
