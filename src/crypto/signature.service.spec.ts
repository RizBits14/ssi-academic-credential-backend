import { describe, expect, it } from '@jest/globals';
import { SignatureService } from './signature.service';

describe('SignatureService', () => {
  const signatureService = new SignatureService();

  it('should generate an Ed25519 key pair', () => {
    const keyPair = signatureService.generateKeyPair();

    expect(keyPair.publicKey).toContain('BEGIN PUBLIC KEY');

    expect(keyPair.privateKey).toContain('BEGIN PRIVATE KEY');
  });

  it('should sign and verify data', () => {
    const keyPair = signatureService.generateKeyPair();

    const data = 'academic-credential';

    const signature = signatureService.sign(data, keyPair.privateKey);

    const valid = signatureService.verify(data, signature, keyPair.publicKey);

    expect(valid).toBe(true);
  });

  it('should reject modified data', () => {
    const keyPair = signatureService.generateKeyPair();

    const signature = signatureService.sign('cgpa:3.75', keyPair.privateKey);

    const valid = signatureService.verify(
      'cgpa:4.00',
      signature,
      keyPair.publicKey,
    );

    expect(valid).toBe(false);
  });
});
