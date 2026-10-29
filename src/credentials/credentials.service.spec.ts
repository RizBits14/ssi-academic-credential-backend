import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createHash } from 'node:crypto';

import { canonicalizeJson } from '../common/utils/json-canonicalization.util';
import { EncryptionService } from '../crypto/encryption.service';
import { DidService } from '../did/did.service';
import { DidOwnerType, DidStatus } from '../generated/prisma/enums';
import { CredentialsService } from './credentials.service';

describe('CredentialsService', () => {
  const mockHashingService = {
    sha256: jest.fn<(...args: unknown[]) => string>(),
  };

  const mockDidService = {
    findPublicByOwner: jest.fn<(...args: unknown[]) => Promise<unknown>>(),

    signForOrganization: jest.fn<
      (
        organizationId: string,
        data: string | Buffer,
      ) => Promise<{
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

  const issuerDid = 'did:example:university';

  const validSignatureBase64 =
    'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ==';

  const validSignatureMultibase =
    'z2AXDGYSE4f2sz7tvMMzyHvUfcoJmxudvdhBcmiUSo6ijwfYmfZYsKRxboQMPh3R4kUhXRVdtSXFXMheka4Rc4P2';

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
      issuerDid,
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
        id: issuerDid,
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

  it('should include credential expiry in issuer-signed credential data', () => {
    const expiresAt = new Date('2099-01-01T00:00:00.000Z');
    const credential = service.buildUnsignedAcademicCredential({
      issuerDid,
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
      expiresAt,
    });

    expect(credential.validUntil).toBe(expiresAt.toISOString());
    expect(credential.validFrom).toBe('2026-10-19T12:00:00.000Z');
  });

  it('should omit optional academic fields when they are not provided', () => {
    const credential = service.buildUnsignedAcademicCredential({
      issuerDid,
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

    expect(credential).not.toHaveProperty('validUntil');
    expect(credential.credentialSubject).not.toHaveProperty('department');
    expect(credential.credentialSubject).not.toHaveProperty('cgpa');
  });

  it('should add an eddsa-jcs-2022 Data Integrity issuer proof', async () => {
    const createdAt = new Date('2026-10-19T12:00:00.000Z');

    const unsignedCredential = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      id: 'urn:uuid:credential-id',
      issuer: {
        id: issuerDid,
      },
      credentialSubject: {
        id: 'did:example:holder',
        degree: 'Bachelor of Science',
      },
    };

    mockDidService.findPublicByOwner.mockResolvedValue({
      id: 'did-record-id',
      did: issuerDid,
      ownerType: DidOwnerType.ORGANIZATION,
      ownerId: 'university-id',
      currentKeyVersion: 2,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDidService.signForOrganization.mockResolvedValue({
      did: issuerDid,
      keyVersion: 2,
      signature: validSignatureBase64,
    });

    const result = await service.addIssuerProof(
      'university-id',
      unsignedCredential,
      createdAt,
    );

    expect(mockDidService.findPublicByOwner).toHaveBeenCalledWith(
      DidOwnerType.ORGANIZATION,
      'university-id',
    );

    const proofConfiguration = {
      type: 'DataIntegrityProof',
      cryptosuite: 'eddsa-jcs-2022',
      created: createdAt.toISOString(),
      verificationMethod: `${issuerDid}#key-2`,
      proofPurpose: 'assertionMethod',
      '@context': ['https://www.w3.org/ns/credentials/v2'],
    };

    const proofConfigHash = createHash('sha256')
      .update(canonicalizeJson(proofConfiguration), 'utf8')
      .digest();

    const transformedDocumentHash = createHash('sha256')
      .update(canonicalizeJson(unsignedCredential), 'utf8')
      .digest();

    const expectedSigningPayload = Buffer.concat([
      proofConfigHash,
      transformedDocumentHash,
    ]);

    expect(expectedSigningPayload).toHaveLength(64);

    expect(mockDidService.signForOrganization).toHaveBeenCalledWith(
      'university-id',
      expectedSigningPayload,
    );

    expect(result).toEqual({
      ...unsignedCredential,
      proof: {
        type: 'DataIntegrityProof',
        cryptosuite: 'eddsa-jcs-2022',
        created: createdAt.toISOString(),
        verificationMethod: `${issuerDid}#key-2`,
        proofPurpose: 'assertionMethod',
        '@context': ['https://www.w3.org/ns/credentials/v2'],
        proofValue: validSignatureMultibase,
      },
    });
  });

  it('should reject signing when the credential issuer does not match the organization DID', async () => {
    const unsignedCredential = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      id: 'urn:uuid:credential-id',
      issuer: {
        id: 'did:example:different-university',
      },
      credentialSubject: {
        id: 'did:example:holder',
      },
    };

    mockDidService.findPublicByOwner.mockResolvedValue({
      id: 'did-record-id',
      did: issuerDid,
      ownerType: DidOwnerType.ORGANIZATION,
      ownerId: 'university-id',
      currentKeyVersion: 2,
      status: DidStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.addIssuerProof(
        'university-id',
        unsignedCredential,
        new Date('2026-10-19T12:00:00.000Z'),
      ),
    ).rejects.toThrow('Credential issuer does not match organization DID');

    expect(mockDidService.signForOrganization).not.toHaveBeenCalled();
  });

  it('should retry issuer proof creation when the DID key rotates during signing', async () => {
    const createdAt = new Date('2026-10-19T12:00:00.000Z');

    const unsignedCredential = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      id: 'urn:uuid:credential-id',
      issuer: {
        id: issuerDid,
      },
      credentialSubject: {
        id: 'did:example:holder',
      },
    };

    mockDidService.findPublicByOwner
      .mockResolvedValueOnce({
        id: 'did-record-id',
        did: issuerDid,
        ownerType: DidOwnerType.ORGANIZATION,
        ownerId: 'university-id',
        currentKeyVersion: 2,
        status: DidStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'did-record-id',
        did: issuerDid,
        ownerType: DidOwnerType.ORGANIZATION,
        ownerId: 'university-id',
        currentKeyVersion: 3,
        status: DidStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    mockDidService.signForOrganization
      .mockResolvedValueOnce({
        did: issuerDid,
        keyVersion: 3,
        signature: validSignatureBase64,
      })
      .mockResolvedValueOnce({
        did: issuerDid,
        keyVersion: 3,
        signature: validSignatureBase64,
      });

    const result = await service.addIssuerProof(
      'university-id',
      unsignedCredential,
      createdAt,
    );

    expect(mockDidService.findPublicByOwner).toHaveBeenCalledTimes(2);

    expect(mockDidService.signForOrganization).toHaveBeenCalledTimes(2);

    expect(result.proof).toEqual({
      type: 'DataIntegrityProof',
      cryptosuite: 'eddsa-jcs-2022',
      created: createdAt.toISOString(),
      verificationMethod: `${issuerDid}#key-3`,
      proofPurpose: 'assertionMethod',
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      proofValue: validSignatureMultibase,
    });
  });

  it('should fail when the DID key cannot remain stable during signing', async () => {
    const unsignedCredential = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      id: 'urn:uuid:credential-id',
      issuer: {
        id: issuerDid,
      },
      credentialSubject: {
        id: 'did:example:holder',
      },
    };

    mockDidService.findPublicByOwner
      .mockResolvedValueOnce({
        id: 'did-record-id',
        did: issuerDid,
        ownerType: DidOwnerType.ORGANIZATION,
        ownerId: 'university-id',
        currentKeyVersion: 1,
        status: DidStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'did-record-id',
        did: issuerDid,
        ownerType: DidOwnerType.ORGANIZATION,
        ownerId: 'university-id',
        currentKeyVersion: 2,
        status: DidStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'did-record-id',
        did: issuerDid,
        ownerType: DidOwnerType.ORGANIZATION,
        ownerId: 'university-id',
        currentKeyVersion: 3,
        status: DidStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    mockDidService.signForOrganization
      .mockResolvedValueOnce({
        did: issuerDid,
        keyVersion: 2,
        signature: validSignatureBase64,
      })
      .mockResolvedValueOnce({
        did: issuerDid,
        keyVersion: 3,
        signature: validSignatureBase64,
      })
      .mockResolvedValueOnce({
        did: issuerDid,
        keyVersion: 4,
        signature: validSignatureBase64,
      });

    await expect(
      service.addIssuerProof(
        'university-id',
        unsignedCredential,
        new Date('2026-10-19T12:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(mockDidService.signForOrganization).toHaveBeenCalledTimes(3);
  });

  it('should encrypt a signed credential for wallet storage', () => {
    const signedCredential = {
      id: 'urn:uuid:credential-id',
      proof: {
        type: 'DataIntegrityProof',
        cryptosuite: 'eddsa-jcs-2022',
        proofValue: validSignatureMultibase,
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
