import { describe, expect, it } from '@jest/globals';

import { SignatureService } from './signature.service';

describe('SignatureService', () => {
  const signatureService = new SignatureService();

  describe('Ed25519', () => {
    it('should generate an Ed25519 key pair using the backward-compatible API', () => {
      const keyPair = signatureService.generateKeyPair();

      expect(keyPair.publicKey).toContain('BEGIN PUBLIC KEY');
      expect(keyPair.privateKey).toContain('BEGIN PRIVATE KEY');
    });

    it('should generate an Ed25519 key pair using the algorithm-aware API', () => {
      const keyPair = signatureService.generateKeyPairForAlgorithm('Ed25519');

      expect(keyPair.publicKey).toContain('BEGIN PUBLIC KEY');
      expect(keyPair.privateKey).toContain('BEGIN PRIVATE KEY');
    });

    it('should sign and verify Ed25519 string data using the backward-compatible API', () => {
      const keyPair = signatureService.generateKeyPair();

      const data = 'academic-credential';

      const signature = signatureService.sign(data, keyPair.privateKey);

      const valid = signatureService.verify(data, signature, keyPair.publicKey);

      expect(valid).toBe(true);
    });

    it('should sign and verify Ed25519 Buffer data', () => {
      const keyPair = signatureService.generateKeyPairForAlgorithm('Ed25519');

      const data = Buffer.from('academic-credential-buffer', 'utf8');

      const signature = signatureService.signWithAlgorithm(
        data,
        keyPair.privateKey,
        'Ed25519',
      );

      const valid = signatureService.verifyWithAlgorithm(
        data,
        signature,
        keyPair.publicKey,
        'Ed25519',
      );

      expect(valid).toBe(true);
    });

    it('should produce a 64-byte Ed25519 signature', () => {
      const keyPair = signatureService.generateKeyPairForAlgorithm('Ed25519');

      const signature = signatureService.signWithAlgorithm(
        'academic-credential',
        keyPair.privateKey,
        'Ed25519',
      );

      expect(Buffer.from(signature, 'base64')).toHaveLength(64);
    });

    it('should reject modified Ed25519 data', () => {
      const keyPair = signatureService.generateKeyPair();

      const signature = signatureService.sign('cgpa:3.75', keyPair.privateKey);

      const valid = signatureService.verify(
        'cgpa:4.00',
        signature,
        keyPair.publicKey,
      );

      expect(valid).toBe(false);
    });

    it('should reject an Ed25519 signature verified with another public key', () => {
      const signer = signatureService.generateKeyPairForAlgorithm('Ed25519');

      const otherKeyPair =
        signatureService.generateKeyPairForAlgorithm('Ed25519');

      const signature = signatureService.signWithAlgorithm(
        'academic-credential',
        signer.privateKey,
        'Ed25519',
      );

      const valid = signatureService.verifyWithAlgorithm(
        'academic-credential',
        signature,
        otherKeyPair.publicKey,
        'Ed25519',
      );

      expect(valid).toBe(false);
    });
  });

  describe('P-256', () => {
    it('should generate a P-256 key pair', () => {
      const keyPair = signatureService.generateKeyPairForAlgorithm('P-256');

      expect(keyPair.publicKey).toContain('BEGIN PUBLIC KEY');
      expect(keyPair.privateKey).toContain('BEGIN PRIVATE KEY');
    });

    it('should sign and verify P-256 string data', () => {
      const keyPair = signatureService.generateKeyPairForAlgorithm('P-256');

      const data = 'selectively-disclosable-academic-credential';

      const signature = signatureService.signWithAlgorithm(
        data,
        keyPair.privateKey,
        'P-256',
      );

      const valid = signatureService.verifyWithAlgorithm(
        data,
        signature,
        keyPair.publicKey,
        'P-256',
      );

      expect(valid).toBe(true);
    });

    it('should sign and verify P-256 Buffer data', () => {
      const keyPair = signatureService.generateKeyPairForAlgorithm('P-256');

      const data = Buffer.from('selective-disclosure-buffer', 'utf8');

      const signature = signatureService.signWithAlgorithm(
        data,
        keyPair.privateKey,
        'P-256',
      );

      const valid = signatureService.verifyWithAlgorithm(
        data,
        signature,
        keyPair.publicKey,
        'P-256',
      );

      expect(valid).toBe(true);
    });

    it('should produce a 64-byte IEEE-P1363 P-256 signature', () => {
      const keyPair = signatureService.generateKeyPairForAlgorithm('P-256');

      const signature = signatureService.signWithAlgorithm(
        'academic-credential',
        keyPair.privateKey,
        'P-256',
      );

      expect(Buffer.from(signature, 'base64')).toHaveLength(64);
    });

    it('should reject modified P-256 data', () => {
      const keyPair = signatureService.generateKeyPairForAlgorithm('P-256');

      const signature = signatureService.signWithAlgorithm(
        'cgpa:3.75',
        keyPair.privateKey,
        'P-256',
      );

      const valid = signatureService.verifyWithAlgorithm(
        'cgpa:4.00',
        signature,
        keyPair.publicKey,
        'P-256',
      );

      expect(valid).toBe(false);
    });

    it('should reject a P-256 signature verified with another public key', () => {
      const signer = signatureService.generateKeyPairForAlgorithm('P-256');

      const otherKeyPair =
        signatureService.generateKeyPairForAlgorithm('P-256');

      const signature = signatureService.signWithAlgorithm(
        'academic-credential',
        signer.privateKey,
        'P-256',
      );

      const valid = signatureService.verifyWithAlgorithm(
        'academic-credential',
        signature,
        otherKeyPair.publicKey,
        'P-256',
      );

      expect(valid).toBe(false);
    });
  });
});
