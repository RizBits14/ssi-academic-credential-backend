import { describe, expect, it, jest } from '@jest/globals';

import { AcademicRecordsService } from '../academic-records/academic-records.service';
import { CredentialSchemasService } from '../credential-schemas/credential-schemas.service';
import { DidService } from '../did/did.service';
import {
  DidOwnerType,
  DidStatus,
  OrganizationType,
} from '../generated/prisma/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { CredentialIssuanceService } from './credential-issuance.service';
import { CredentialsService } from './credentials.service';

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

  const service = new CredentialIssuanceService(
    mockAcademicRecordsService as unknown as AcademicRecordsService,
    mockCredentialSchemasService as unknown as CredentialSchemasService,
    mockOrganizationsService as unknown as OrganizationsService,
    mockDidService as unknown as DidService,
    mockCredentialsService as unknown as CredentialsService,
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
});
