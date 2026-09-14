import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from '@jest/globals';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  const configService = {
    getOrThrow: () =>
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  } as unknown as ConfigService;

  const encryptionService = new EncryptionService(configService);

  it('should encrypt and decrypt plaintext', () => {
    const plaintext = 'sensitive-private-key';

    const encrypted = encryptionService.encrypt(plaintext);

    expect(encrypted.ciphertext).not.toBe(plaintext);
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();

    const decrypted = encryptionService.decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext for repeated encryption', () => {
    const first = encryptionService.encrypt('same-value');

    const second = encryptionService.encrypt('same-value');

    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.iv).not.toBe(second.iv);
  });
});
