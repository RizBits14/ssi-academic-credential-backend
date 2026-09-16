import { describe, expect, it, jest } from '@jest/globals';

import { AcademicRecordsService } from '../academic-records/academic-records.service';
import { CredentialSchemasService } from '../credential-schemas/credential-schemas.service';
import { DidService } from '../did/did.service';
import {
  CredentialStatus,
  DidOwnerType,
  DidStatus,
  OrganizationType,
} from '../generated/prisma/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialIssuanceService } from './credential-issuance.service';

describe('CredentialIssuanceService', () => {
  const mockAcademicRecordsService = {
    findById: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  const mockCredentialSchemasService = {
    findById: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    validateClaims: jest.fn<(...args: unknown[]) => void>(),
  };

  const mockOrganizationsService = {
    findById: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  const mockDidService = {
    findByOwner: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  const mockCredentialsService = {
    buildUnsignedAcademicCredential:
      jest.fn<(...args: unknown[]) => Record<string, unknown>>(),

    hashCredential: jest.fn<(...args: unknown[]) => string>(),

    addIssuerProof:
      jest.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>(),

    encryptCredentialForWallet: jest.fn<
      (...args: unknown[]) => {
        ciphertext: string;
        iv: string;
        authTag: string;
      }
    >(),
  };

  const mockTransactionClient = {
    credential: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    walletCredential: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    credentialStatusHistory: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    auditLog: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const mockPrismaService = {
    $transaction: jest.fn(
      async (
        callback: (
          transaction: typeof mockTransactionClient,
        ) => Promise<unknown>,
      ) => callback(mockTransactionClient),
    ),
  };

  const service = new CredentialIssuanceService(
    mockAcademicRecordsService as unknown as AcademicRecordsService,
    mockCredentialSchemasService as unknown as CredentialSchemasService,
    mockOrganizationsService as unknown as OrganizationsService,
    mockDidService as unknown as DidService,
    mockCredentialsService,
    mockPrismaService as unknown as PrismaService,
  );

  it('should prepare a signed and encrypted credential', async () => {
    mockOrganizationsService.findById.mockResolvedValue({
      id: 'university-id',
      name: 'Example University',
      type: OrganizationType.UNIVERSITY,
    });

    mockAcademicRecordsService.findById.mockResolvedValue({
      id: 'record-id',
      universityId: 'university-id',
      holderId: 'holder-id',
      studentId: '20260001',
      fullName: 'Sample Applicant',
      degree: 'Bachelor of Science',
      department: 'Computer Science and Engineering',
      major: 'Computer Science',
      cgpa: 3.75,
      graduationYear: 2026,
    });

    mockCredentialSchemasService.findById.mockResolvedValue({
      id: 'schema-id',
      organizationId: 'university-id',
      name: 'AcademicCredential',
      version: '1.0',
      status: 'ACTIVE',
      schemaJson: {
        name: 'AcademicCredential',
        version: '1.0',
        requiredClaims: [
          'fullName',
          'studentId',
          'university',
          'degree',
          'major',
          'cgpa',
          'graduationYear',
        ],
      },
    });

    mockDidService.findByOwner
      .mockResolvedValueOnce({
        did: 'did:mock:university:123',
        status: DidStatus.ACTIVE,
      })
      .mockResolvedValueOnce({
        did: 'did:mock:holder:456',
        status: DidStatus.ACTIVE,
      });

    const unsignedCredential = {
      id: 'urn:uuid:credential-123',
    };

    mockCredentialsService.buildUnsignedAcademicCredential.mockReturnValue(
      unsignedCredential,
    );

    mockCredentialsService.hashCredential.mockReturnValue('credential-hash');

    mockCredentialsService.addIssuerProof.mockResolvedValue({
      ...unsignedCredential,
      proof: {
        proofValue: 'signature',
      },
    });

    mockCredentialsService.encryptCredentialForWallet.mockReturnValue({
      ciphertext: 'encrypted',
      iv: 'iv',
      authTag: 'auth-tag',
    });

    const result = await service.prepare({
      issuerOrganizationId: 'university-id',
      academicRecordId: 'record-id',
      schemaId: 'schema-id',
    });

    expect(mockDidService.findByOwner).toHaveBeenNthCalledWith(
      1,
      DidOwnerType.ORGANIZATION,
      'university-id',
    );

    expect(mockDidService.findByOwner).toHaveBeenNthCalledWith(
      2,
      DidOwnerType.USER,
      'holder-id',
    );

    expect(mockCredentialSchemasService.validateClaims).toHaveBeenCalled();

    expect(result).toEqual(
      expect.objectContaining({
        vcId: 'urn:uuid:credential-123',
        issuerOrganizationId: 'university-id',
        holderId: 'holder-id',
        schemaId: 'schema-id',
        academicRecordId: 'record-id',
        credentialHash: 'credential-hash',
        encryptedWalletCredential: {
          ciphertext: 'encrypted',
          iv: 'iv',
          authTag: 'auth-tag',
        },
      }),
    );
  });

  it('should persist issuance records and audit log in one transaction', async () => {
    const preparedCredential = {
      vcId: 'urn:uuid:credential-123',
      issuerOrganizationId: 'university-id',
      issuerDid: 'did:mock:university:123',
      holderId: 'holder-id',
      holderDid: 'did:mock:holder:456',
      schemaId: 'schema-id',
      academicRecordId: 'record-id',
      credentialHash: 'credential-hash',
      issuedAt: new Date('2026-09-15T00:00:00.000Z'),
      expiresAt: undefined,

      signedCredential: {
        id: 'urn:uuid:credential-123',
        proof: {
          type: 'Ed25519Signature',
          created: '2026-09-15T00:00:00.000Z',
          verificationMethod: 'did:mock:university:123#key-1',
          proofValue: 'signature',
        },
      },

      encryptedWalletCredential: {
        ciphertext: 'encrypted',
        iv: 'iv',
        authTag: 'auth-tag',
      },
    };

    jest.spyOn(service, 'prepare').mockResolvedValueOnce(preparedCredential);

    mockTransactionClient.credential.create.mockResolvedValue({
      id: 'credential-db-id',
      vcId: preparedCredential.vcId,
      status: CredentialStatus.ACTIVE,
    });

    mockTransactionClient.walletCredential.create.mockResolvedValue({
      id: 'wallet-credential-id',
      credentialId: 'credential-db-id',
    });

    mockTransactionClient.credentialStatusHistory.create.mockResolvedValue({
      id: 'history-id',
    });

    mockTransactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.issue({
      issuerOrganizationId: 'university-id',
      academicRecordId: 'record-id',
      schemaId: 'schema-id',
      actorId: 'issuer-admin-id',
    });

    expect(mockPrismaService.$transaction).toHaveBeenCalled();

    expect(mockTransactionClient.credential.create).toHaveBeenCalledWith({
      data: {
        vcId: preparedCredential.vcId,
        issuerOrganizationId: preparedCredential.issuerOrganizationId,
        issuerDid: preparedCredential.issuerDid,
        holderId: preparedCredential.holderId,
        holderDid: preparedCredential.holderDid,
        schemaId: preparedCredential.schemaId,
        academicRecordId: preparedCredential.academicRecordId,
        credentialHash: preparedCredential.credentialHash,
        status: CredentialStatus.ACTIVE,
        issuedAt: preparedCredential.issuedAt,
        expiresAt: undefined,
      },
    });

    expect(mockTransactionClient.walletCredential.create).toHaveBeenCalledWith({
      data: {
        holderId: preparedCredential.holderId,
        credentialId: 'credential-db-id',
        ciphertext: 'encrypted',
        iv: 'iv',
        authTag: 'auth-tag',
      },
    });

    expect(
      mockTransactionClient.credentialStatusHistory.create,
    ).toHaveBeenCalledWith({
      data: {
        credentialId: 'credential-db-id',
        previousStatus: null,
        newStatus: CredentialStatus.ACTIVE,
        changedBy: 'issuer-admin-id',
        reason: 'Credential issued',
      },
    });

    expect(mockTransactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'issuer-admin-id',
        organizationId: 'university-id',
        action: 'CREDENTIAL_ISSUED',
        resourceType: 'Credential',
        resourceId: 'credential-db-id',
        metadata: {
          vcId: preparedCredential.vcId,
          holderId: preparedCredential.holderId,
          academicRecordId: preparedCredential.academicRecordId,
          schemaId: preparedCredential.schemaId,
        },
      },
    });

    expect(result).toEqual({
      credential: {
        id: 'credential-db-id',
        vcId: 'urn:uuid:credential-123',
        status: CredentialStatus.ACTIVE,
      },
      walletCredentialId: 'wallet-credential-id',
      signedCredential: preparedCredential.signedCredential,
    });
  });
});
