import { describe, expect, it, jest } from '@jest/globals';
import { EncryptionService } from '../crypto/encryption.service';
import { HashingService } from '../crypto/hashing.service';
import { DidService } from '../did/did.service';
import { CredentialsService } from './credentials.service';

describe('CredentialsService', () => {
  const hashingService = new HashingService();

  const mockDidService = {
    signForOrganization: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  const mockEncryptionService = {
    encrypt: jest.fn<
      (...args: unknown[]) => {
        ciphertext: string;
        iv: string;
        authTag: string;
      }
    >(),
  };

  const service = new CredentialsService(
    hashingService,
    mockDidService as unknown as DidService,
    mockEncryptionService as unknown as EncryptionService,
  );

  it('should build an unsigned academic credential', () => {
    const credential = service.buildUnsignedAcademicCredential({
      issuerDid: 'did:mock:university:123',
      issuerName: 'Example University',
      holderDid: 'did:mock:holder:456',
      fullName: 'Sample Applicant',
      studentId: '20260001',
      degree: 'Bachelor of Science',
      department: 'Computer Science and Engineering',
      major: 'Computer Science',
      cgpa: 3.75,
      graduationYear: 2026,
      schemaName: 'AcademicCredential',
      schemaVersion: '1.0',
      issuedAt: new Date('2026-09-15T00:00:00.000Z'),
    });

    expect(credential.id).toMatch(/^urn:uuid:/);

    expect(credential.type).toEqual([
      'VerifiableCredential',
      'AcademicCredential',
    ]);

    expect(credential.issuer).toEqual({
      id: 'did:mock:university:123',
      name: 'Example University',
    });

    expect(credential.credentialSubject).toEqual(
      expect.objectContaining({
        id: 'did:mock:holder:456',
        studentId: '20260001',
        cgpa: 3.75,
        graduationYear: 2026,
      }),
    );

    expect(credential).not.toHaveProperty('proof');
  });

  it('should canonicalize objects deterministically', () => {
    const first = {
      z: 1,
      a: {
        y: 2,
        b: 3,
      },
    };

    const second = {
      a: {
        b: 3,
        y: 2,
      },
      z: 1,
    };

    expect(service.canonicalize(first)).toBe(service.canonicalize(second));
  });

  it('should generate the same hash for equivalent objects', () => {
    const first = {
      degree: 'Bachelor of Science',
      cgpa: 3.75,
      studentId: '20260001',
    };

    const second = {
      studentId: '20260001',
      degree: 'Bachelor of Science',
      cgpa: 3.75,
    };

    expect(service.hashCredential(first)).toBe(service.hashCredential(second));
  });

  it('should generate a different hash when credential data changes', () => {
    const original = {
      studentId: '20260001',
      cgpa: 3.75,
    };

    const modified = {
      studentId: '20260001',
      cgpa: 4.0,
    };

    expect(service.hashCredential(original)).not.toBe(
      service.hashCredential(modified),
    );
  });

  it('should add an issuer proof to the credential', async () => {
    mockDidService.signForOrganization.mockResolvedValue({
      did: 'did:mock:university:123',
      keyVersion: 1,
      signature: 'base64-signature',
    });

    const unsignedCredential = {
      id: 'urn:uuid:test',
      type: ['VerifiableCredential', 'AcademicCredential'],
      credentialSubject: {
        studentId: '20260001',
        cgpa: 3.75,
      },
    };

    const result = await service.addIssuerProof(
      'university-id',
      unsignedCredential,
      new Date('2026-09-15T00:00:00.000Z'),
    );

    expect(mockDidService.signForOrganization).toHaveBeenCalledWith(
      'university-id',
      service.canonicalize(unsignedCredential),
    );

    expect(result.proof).toEqual({
      type: 'Ed25519Signature',
      created: '2026-09-15T00:00:00.000Z',
      verificationMethod: 'did:mock:university:123#key-1',
      proofValue: 'base64-signature',
    });
  });

  it('should encrypt the signed credential for wallet storage', () => {
    const signedCredential = {
      id: 'urn:uuid:test',
      type: ['VerifiableCredential', 'AcademicCredential'],
      credentialSubject: {
        studentId: '20260001',
        cgpa: 3.75,
      },
      proof: {
        type: 'Ed25519Signature',
        proofValue: 'base64-signature',
      },
    };

    mockEncryptionService.encrypt.mockReturnValue({
      ciphertext: 'encrypted-credential',
      iv: 'test-iv',
      authTag: 'test-auth-tag',
    });

    const result = service.encryptCredentialForWallet(signedCredential);

    expect(mockEncryptionService.encrypt).toHaveBeenCalledWith(
      JSON.stringify(signedCredential),
    );

    expect(result).toEqual({
      ciphertext: 'encrypted-credential',
      iv: 'test-iv',
      authTag: 'test-auth-tag',
    });
  });
});
