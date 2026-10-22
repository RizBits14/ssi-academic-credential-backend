import { ConfigService } from '@nestjs/config';
import { createCipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';

import { EncryptionService } from './encryption.service';

const MASTER_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const DID_KEY_V1 =
  '1111111111111111111111111111111111111111111111111111111111111111';

const DID_KEY_V2 =
  '2222222222222222222222222222222222222222222222222222222222222222';

const WALLET_KEY_V1 =
  '3333333333333333333333333333333333333333333333333333333333333333';

function createConfigService(didActiveKeyId = 'v2'): ConfigService {
  const values: Record<string, string> = {
    MASTER_ENCRYPTION_KEY: MASTER_KEY,
    DID_ENCRYPTION_ACTIVE_KEY_ID: didActiveKeyId,
    DID_ENCRYPTION_KEY_V1: DID_KEY_V1,
    DID_ENCRYPTION_KEY_V2: DID_KEY_V2,
    WALLET_ENCRYPTION_ACTIVE_KEY_ID: 'v1',
    WALLET_ENCRYPTION_KEY_V1: WALLET_KEY_V1,
  };

  return {
    getOrThrow: <T>(key: string): T => {
      const value = values[key];

      if (!value) {
        throw new Error(`Missing test configuration: ${key}`);
      }

      return value as T;
    },
  } as ConfigService;
}

function encryptLegacy(plaintext: string) {
  const iv = randomBytes(12);

  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(MASTER_KEY, 'hex'),
    iv,
  );

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

describe('EncryptionService', () => {
  it('should encrypt and decrypt DID private-key data with the active DID key', () => {
    const encryptionService = new EncryptionService(createConfigService());

    const encrypted = encryptionService.encryptForDid('sensitive-private-key');

    expect(encrypted.ciphertext).not.toBe('sensitive-private-key');
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
    expect(encrypted.keyId).toBe('v2');

    expect(encryptionService.decryptForDid(encrypted)).toBe(
      'sensitive-private-key',
    );
  });

  it('should encrypt and decrypt wallet data with the active wallet key', () => {
    const encryptionService = new EncryptionService(createConfigService());

    const encrypted = encryptionService.encryptForWallet('wallet-credential');

    expect(encrypted.keyId).toBe('v1');

    expect(encryptionService.decryptForWallet(encrypted)).toBe(
      'wallet-credential',
    );
  });

  it('should produce different ciphertext for repeated encryption', () => {
    const encryptionService = new EncryptionService(createConfigService());

    const first = encryptionService.encryptForDid('same-value');
    const second = encryptionService.encryptForDid('same-value');

    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.iv).not.toBe(second.iv);
  });

  it('should keep older versioned DID ciphertext decryptable after key rotation', () => {
    const oldService = new EncryptionService(createConfigService('v1'));

    const oldEncrypted = oldService.encryptForDid('old-private-key');

    expect(oldEncrypted.keyId).toBe('v1');

    const rotatedService = new EncryptionService(createConfigService('v2'));

    expect(rotatedService.decryptForDid(oldEncrypted)).toBe('old-private-key');

    const newEncrypted = rotatedService.encryptForDid('new-private-key');

    expect(newEncrypted.keyId).toBe('v2');
  });

  it('should decrypt legacy ciphertext without a key id using MASTER_ENCRYPTION_KEY', () => {
    const encryptionService = new EncryptionService(createConfigService());

    const legacyEncrypted = encryptLegacy('legacy-secret');

    expect(
      encryptionService.decryptForDid({
        ...legacyEncrypted,
        keyId: null,
      }),
    ).toBe('legacy-secret');

    expect(encryptionService.decryptForWallet(legacyEncrypted)).toBe(
      'legacy-secret',
    );
  });

  it('should cryptographically separate DID and wallet encryption domains', () => {
    const encryptionService = new EncryptionService(createConfigService());

    const encrypted = encryptionService.encryptForDid('private-key');

    expect(() => encryptionService.decryptForWallet(encrypted)).toThrow();
  });

  it('should reject an invalid active encryption key id', () => {
    const configService = {
      getOrThrow: <T>(key: string): T => {
        const values: Record<string, string> = {
          MASTER_ENCRYPTION_KEY: MASTER_KEY,
          DID_ENCRYPTION_ACTIVE_KEY_ID: 'v1-invalid',
          WALLET_ENCRYPTION_ACTIVE_KEY_ID: 'v1',
        };

        const value = values[key];

        if (!value) {
          throw new Error(`Missing test configuration: ${key}`);
        }

        return value as T;
      },
    } as ConfigService;

    expect(() => new EncryptionService(configService)).toThrow(
      'DID_ENCRYPTION_ACTIVE_KEY_ID must contain only letters, numbers, and underscores',
    );
  });
});
