import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { EncryptionService } from '../crypto/encryption.service';
import { DidService } from '../did/did.service';
import { CredentialsService } from './credentials.service';

describe('CredentialsService', () => {
  const mockHashingService = {
    sha256: jest.fn<(...args: unknown[]) => string>(),
  };

  const mockDidService = {
    signForOrganization: jest.fn<
      (...args: unknown[]) => Promise<{
        did: string;
        keyVersion: number;
        signature: string;
      }>
    >(),
  };

  const mockEncryptionService = {
    encryptForWallet: jest.fn<(...args: unknown[]) => unknown>(),
  };

  let service: CredentialsService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new CredentialsService(
      mockHashingService,
      mockDidService as unknown as DidService,
      mockEncryptionService as unknown as EncryptionService,
    );
  });

  it('should build an unsigned academic credential', () => {
    const issuedAt = new Date('2026-10-19T12:00:00.000Z');

    const credential = service.buildUnsignedAcademicCredential({
      issuerDid: 'did:example:university',
      issuerName: 'Example University',
      holderDid: 'did:example:holder',
      fullName: 'Sample Student',
      studentId: '20260001',
      degree: 'Bachelor of Science',
      department: 'Computer Science',
      major: 'Computer Science',
      cgpa: 3.75,
      graduationYear: 2026,
      schemaName: 'AcademicCredential',
      schemaVersion: '1.0',
      issuedAt,
    });

    expect(credential).toEqual({
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      id: expect.stringMatching(/^urn:uuid:/),
      type: ['VerifiableCredential', 'AcademicCredential'],
      issuer: {
        id: 'did:example:university',
        name: 'Example University',
      },
      validFrom: issuedAt.toISOString(),
      credentialSubject: {
        id: 'did:example:holder',
        fullName: 'Sample Student',
        studentId: '20260001',
        degree: 'Bachelor of Science',
        department: 'Computer Science',
        major: 'Computer Science',
        cgpa: 3.75,
        graduationYear: 2026,
      },
      metadata: {
        schema: 'AcademicCredential',
        schemaVersion: '1.0',
      },
    });
  });

  it('should omit optional academic fields when they are not provided', () => {
    const credential = service.buildUnsignedAcademicCredential({
      issuerDid: 'did:example:university',
      issuerName: 'Example University',
      holderDid: 'did:example:holder',
      fullName: 'Sample Student',
      studentId: '20260001',
      degree: 'Bachelor of Science',
      major: 'Computer Science',
      graduationYear: 2026,
      schemaName: 'AcademicCredential',
      schemaVersion: '1.0',
      issuedAt: new Date('2026-10-19T12:00:00.000Z'),
    });

    expect(credential.credentialSubject).not.toHaveProperty('department');
    expect(credential.credentialSubject).not.toHaveProperty('cgpa');
  });

  it('should add an issuer proof using the organization DID key', async () => {
    const createdAt = new Date('2026-10-19T12:00:00.000Z');

    const unsignedCredential = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      id: 'urn:uuid:credential-id',
      issuer: {
        id: 'did:example:university',
      },
      credentialSubject: {
        id: 'did:example:holder',
        degree: 'Bachelor of Science',
      },
    };

    mockDidService.signForOrganization.mockResolvedValue({
      did: 'did:example:university',
      keyVersion: 2,
      signature: 'issuer-signature',
    });

    const result = await service.addIssuerProof(
      'university-id',
      unsignedCredential,
      createdAt,
    );

    expect(mockDidService.signForOrganization).toHaveBeenCalledWith(
      'university-id',
      service.canonicalize(unsignedCredential),
    );

    expect(result).toEqual({
      ...unsignedCredential,
      proof: {
        type: 'Ed25519Signature',
        created: createdAt.toISOString(),
        verificationMethod: 'did:example:university#key-2',
        proofValue: 'issuer-signature',
      },
    });
  });

  it('should encrypt a signed credential for wallet storage', () => {
    const signedCredential = {
      id: 'urn:uuid:credential-id',
      proof: {
        type: 'Ed25519Signature',
        proofValue: 'signature',
      },
    };

    const encrypted = {
      ciphertext: 'ciphertext',
      iv: 'iv',
      authTag: 'auth-tag',
      keyId: 'v1',
    };

    mockEncryptionService.encryptForWallet.mockReturnValue(encrypted);

    const result = service.encryptCredentialForWallet(signedCredential);

    expect(mockEncryptionService.encryptForWallet).toHaveBeenCalledWith(
      JSON.stringify(signedCredential),
    );

    expect(result).toEqual(encrypted);
  });

  it('should canonicalize object keys deterministically', () => {
    const value = {
      z: 1,
      a: {
        d: 4,
        b: 2,
      },
      c: [
        {
          y: 2,
          x: 1,
        },
      ],
    };

    expect(service.canonicalize(value)).toBe(
      '{"a":{"b":2,"d":4},"c":[{"x":1,"y":2}],"z":1}',
    );
  });

  it('should hash the canonical credential representation', () => {
    const unsignedCredential = {
      z: 'last',
      a: 'first',
    };

    mockHashingService.sha256.mockReturnValue('credential-hash');

    const result = service.hashCredential(unsignedCredential);

    expect(mockHashingService.sha256).toHaveBeenCalledWith(
      '{"a":"first","z":"last"}',
    );

    expect(result).toBe('credential-hash');
  });
});
