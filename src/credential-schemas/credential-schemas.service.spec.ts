import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { OrganizationType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialSchemasService } from './credential-schemas.service';

describe('CredentialSchemasService', () => {
  const mockPrisma = {
    organization: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    credentialSchema: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      count: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  let service: CredentialSchemasService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new CredentialSchemasService(
      mockPrisma as unknown as PrismaService,
    );
  });

  it('should create a valid academic credential schema', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      type: OrganizationType.UNIVERSITY,
    });

    const schemaJson = {
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
    };

    mockPrisma.credentialSchema.create.mockResolvedValue({
      id: 'schema-id',
      organizationId: 'university-id',
      name: 'AcademicCredential',
      version: '1.0',
      schemaJson,
    });

    const result = await service.create({
      organizationId: 'university-id',
      name: 'AcademicCredential',
      version: '1.0',
      schemaJson,
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'schema-id',
        name: 'AcademicCredential',
      }),
    );
  });

  it('should find a credential schema only within the specified organization', async () => {
    const schema = {
      id: 'schema-id',
      organizationId: 'university-id',
      name: 'AcademicCredential',
      version: '1.0',
    };

    mockPrisma.credentialSchema.findFirst.mockResolvedValue(schema);

    const result = await service.findByIdForOrganization(
      'schema-id',
      'university-id',
    );

    expect(mockPrisma.credentialSchema.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'schema-id',
        organizationId: 'university-id',
      },
    });

    expect(result).toEqual(schema);
  });

  it('should reject a credential schema outside the specified organization', async () => {
    mockPrisma.credentialSchema.findFirst.mockResolvedValue(null);

    await expect(
      service.findByIdForOrganization(
        'schema-from-another-university',
        'university-id',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should keep global schema lookup available for verification', async () => {
    const schema = {
      id: 'schema-id',
      organizationId: 'university-id',
    };

    mockPrisma.credentialSchema.findUnique.mockResolvedValue(schema);

    const result = await service.findById('schema-id');

    expect(mockPrisma.credentialSchema.findUnique).toHaveBeenCalledWith({
      where: {
        id: 'schema-id',
      },
    });

    expect(result).toEqual(schema);
  });

  it('should accept claims containing all required fields', () => {
    const schemaJson = {
      name: 'AcademicCredential',
      version: '1.0',
      requiredClaims: ['fullName', 'studentId', 'degree'],
    };

    expect(() =>
      service.validateClaims(schemaJson, {
        fullName: 'Sample Applicant',
        studentId: '20260001',
        degree: 'Bachelor of Science',
      }),
    ).not.toThrow();
  });

  it('should reject claims when a required field is missing', () => {
    const schemaJson = {
      name: 'AcademicCredential',
      version: '1.0',
      requiredClaims: ['fullName', 'studentId', 'degree'],
    };

    expect(() =>
      service.validateClaims(schemaJson, {
        fullName: 'Sample Applicant',
        studentId: '20260001',
      }),
    ).toThrow(BadRequestException);
  });

  it('should reject duplicate required claims', () => {
    const schemaJson = {
      name: 'AcademicCredential',
      version: '1.0',
      requiredClaims: ['fullName', 'fullName'],
    };

    expect(() =>
      service.validateClaims(schemaJson, {
        fullName: 'Sample Applicant',
      }),
    ).toThrow(BadRequestException);
  });
});
