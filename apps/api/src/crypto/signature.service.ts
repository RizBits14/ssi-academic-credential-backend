import { Injectable } from '@nestjs/common';
import {
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';

export type SupportedSignatureAlgorithm = 'Ed25519' | 'P-256';

export interface SignatureKeyPair {
  publicKey: string;
  privateKey: string;
}

/**
 * Kept as an exported alias for backward compatibility with the
 * existing codebase.
 */
export type Ed25519KeyPair = SignatureKeyPair;

@Injectable()
export class SignatureService {
  /**
   * Backward-compatible default.
   *
   * Existing callers currently expect generateKeyPair() to generate
   * Ed25519 keys, so this behavior must not change.
   */
  generateKeyPair(): Ed25519KeyPair {
    return this.generateKeyPairForAlgorithm('Ed25519');
  }

  /**
   * Generate a key pair for a supported signature algorithm.
   *
   * Ed25519:
   *   - Ed25519 PureEdDSA
   *   - SPKI PEM public key
   *   - PKCS#8 PEM private key
   *
   * P-256:
   *   - ECDSA using the NIST P-256 / prime256v1 curve
   *   - SPKI PEM public key
   *   - PKCS#8 PEM private key
   */
  generateKeyPairForAlgorithm(
    algorithm: SupportedSignatureAlgorithm,
  ): SignatureKeyPair {
    switch (algorithm) {
      case 'Ed25519':
        return this.generateEd25519KeyPair();

      case 'P-256':
        return this.generateP256KeyPair();
    }
  }

  /**
   * Backward-compatible Ed25519 signing API.
   *
   * Existing issuer and holder Data Integrity proof code calls this
   * method and must continue to use Ed25519.
   */
  sign(data: string | Buffer, privateKey: string): string {
    return this.signWithAlgorithm(data, privateKey, 'Ed25519');
  }

  /**
   * Backward-compatible Ed25519 verification API.
   */
  verify(data: string | Buffer, signature: string, publicKey: string): boolean {
    return this.verifyWithAlgorithm(data, signature, publicKey, 'Ed25519');
  }

  /**
   * Algorithm-aware signing API.
   *
   * Ed25519 signs the supplied bytes directly using PureEdDSA.
   *
   * P-256 uses ECDSA with SHA-256 and IEEE-P1363 signature encoding:
   *
   *   r || s
   *
   * where both r and s are 32-byte integers. The resulting P-256
   * signature is therefore exactly 64 bytes before base64 encoding.
   */
  signWithAlgorithm(
    data: string | Buffer,
    privateKey: string,
    algorithm: SupportedSignatureAlgorithm,
  ): string {
    const input = this.normalizeInput(data);

    switch (algorithm) {
      case 'Ed25519': {
        const signature = cryptoSign(null, input, privateKey);

        return signature.toString('base64');
      }

      case 'P-256': {
        const signature = cryptoSign('sha256', input, {
          key: privateKey,
          dsaEncoding: 'ieee-p1363',
        });

        return signature.toString('base64');
      }
    }
  }

  /**
   * Algorithm-aware signature verification.
   */
  verifyWithAlgorithm(
    data: string | Buffer,
    signature: string,
    publicKey: string,
    algorithm: SupportedSignatureAlgorithm,
  ): boolean {
    const input = this.normalizeInput(data);
    const signatureBytes = Buffer.from(signature, 'base64');

    switch (algorithm) {
      case 'Ed25519':
        return cryptoVerify(null, input, publicKey, signatureBytes);

      case 'P-256':
        return cryptoVerify(
          'sha256',
          input,
          {
            key: publicKey,
            dsaEncoding: 'ieee-p1363',
          },
          signatureBytes,
        );
    }
  }

  private generateEd25519KeyPair(): SignatureKeyPair {
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

  private generateP256KeyPair(): SignatureKeyPair {
    const { publicKey, privateKey } = generateKeyPairSync('ec', {
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

    return {
      publicKey,
      privateKey,
    };
  }

  private normalizeInput(data: string | Buffer): Buffer {
    return typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  }
}
