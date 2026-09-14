import { Injectable } from '@nestjs/common';
import { generateKeyPairSync, sign, verify } from 'node:crypto';

export interface Ed25519KeyPair {
  publicKey: string;
  privateKey: string;
}

@Injectable()
export class SignatureService {
  generateKeyPair(): Ed25519KeyPair {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    return {
      publicKey,
      privateKey,
    };
  }

  sign(data: string | Buffer, privateKey: string): string {
    const input = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

    const signature = sign(null, input, privateKey);

    return signature.toString('base64');
  }

  verify(data: string | Buffer, signature: string, publicKey: string): boolean {
    const input = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

    return verify(null, input, publicKey, Buffer.from(signature, 'base64'));
  }
}
