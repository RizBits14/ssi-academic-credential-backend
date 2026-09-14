import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
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
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const service = new CredentialSchemasService(
    mockPrisma as unknown as PrismaService,
  );

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
