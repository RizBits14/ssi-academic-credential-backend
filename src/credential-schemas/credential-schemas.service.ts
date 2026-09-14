import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

interface CredentialSchemaDefinition {
  name: string;
  version: string;
  requiredClaims: string[];
}

interface CreateCredentialSchemaInput {
  organizationId: string;
  name: string;
  version: string;
  description?: string;
  schemaJson: unknown;
}

@Injectable()
export class CredentialSchemasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateCredentialSchemaInput) {
    const organization = await this.prisma.organization.findUnique({
      where: {
        id: input.organizationId,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (organization.type !== OrganizationType.UNIVERSITY) {
      throw new BadRequestException(
        'Credential schemas can only belong to universities',
      );
    }

    const schema = this.parseSchemaDefinition(input.schemaJson);

    if (schema.name !== input.name) {
      throw new BadRequestException(
        'Schema name must match the credential schema name',
      );
    }

    if (schema.version !== input.version) {
      throw new BadRequestException(
        'Schema version must match the credential schema version',
      );
    }

    return this.prisma.credentialSchema.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        version: input.version,
        description: input.description,
        schemaJson: {
          name: schema.name,
          version: schema.version,
          requiredClaims: schema.requiredClaims,
        },
      },
    });
  }

  async findById(id: string) {
    const schema = await this.prisma.credentialSchema.findUnique({
      where: {
        id,
      },
    });

    if (!schema) {
      throw new NotFoundException('Credential schema not found');
    }

    return schema;
  }

  async findByOrganization(organizationId: string) {
    return this.prisma.credentialSchema.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  validateClaims(schemaJson: unknown, claims: Record<string, unknown>): void {
    const schema = this.parseSchemaDefinition(schemaJson);

    const missingClaims = schema.requiredClaims.filter((claim) => {
      const value = claims[claim];

      return value === undefined || value === null || value === '';
    });

    if (missingClaims.length > 0) {
      throw new BadRequestException(
        `Missing required credential claims: ${missingClaims.join(', ')}`,
      );
    }
  }

  private parseSchemaDefinition(
    schemaJson: unknown,
  ): CredentialSchemaDefinition {
    if (
      typeof schemaJson !== 'object' ||
      schemaJson === null ||
      Array.isArray(schemaJson)
    ) {
      throw new BadRequestException('Invalid credential schema JSON');
    }

    const schema = schemaJson as Record<string, unknown>;

    if (typeof schema.name !== 'string' || schema.name.trim().length === 0) {
      throw new BadRequestException('Schema name is required');
    }

    if (
      typeof schema.version !== 'string' ||
      schema.version.trim().length === 0
    ) {
      throw new BadRequestException('Schema version is required');
    }

    if (
      !Array.isArray(schema.requiredClaims) ||
      schema.requiredClaims.length === 0 ||
      !schema.requiredClaims.every(
        (claim) => typeof claim === 'string' && claim.trim().length > 0,
      )
    ) {
      throw new BadRequestException(
        'Schema requiredClaims must be a non-empty string array',
      );
    }

    const requiredClaims = schema.requiredClaims as string[];

    if (new Set(requiredClaims).size !== requiredClaims.length) {
      throw new BadRequestException(
        'Schema requiredClaims must not contain duplicates',
      );
    }

    return {
      name: schema.name,
      version: schema.version,
      requiredClaims,
    };
  }
}
