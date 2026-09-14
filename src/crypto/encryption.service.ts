import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
}

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(configService: ConfigService) {
    const encryptionKey = configService.getOrThrow<string>(
      'MASTER_ENCRYPTION_KEY',
    );

    if (!/^[a-fA-F0-9]{64}$/.test(encryptionKey)) {
      throw new Error(
        'MASTER_ENCRYPTION_KEY must be a 32-byte hexadecimal value',
      );
    }

    this.key = Buffer.from(encryptionKey, 'hex');
  }

  encrypt(plaintext: string): EncryptedData {
    const iv = randomBytes(12);

    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  decrypt(encryptedData: EncryptedData): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(encryptedData.iv, 'base64'),
    );

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'base64'));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encryptedData.ciphertext, 'base64')),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }
}
