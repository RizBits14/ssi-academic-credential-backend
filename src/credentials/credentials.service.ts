import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { HashingService } from '../crypto/hashing.service';

interface BuildAcademicCredentialInput {
  issuerDid: string;
  issuerName: string;
  holderDid: string;

  fullName: string;
  studentId: string;
  degree: string;
  department?: string;
  major: string;
  cgpa?: number;
  graduationYear: number;

  schemaName: string;
  schemaVersion: string;

  issuedAt: Date;
}

@Injectable()
export class CredentialsService {
  constructor(private readonly hashingService: HashingService) {}

  buildUnsignedAcademicCredential(input: BuildAcademicCredentialInput) {
    return {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      id: `urn:uuid:${randomUUID()}`,
      type: ['VerifiableCredential', input.schemaName],
      issuer: {
        id: input.issuerDid,
        name: input.issuerName,
      },
      validFrom: input.issuedAt.toISOString(),
      credentialSubject: {
        id: input.holderDid,
        fullName: input.fullName,
        studentId: input.studentId,
        degree: input.degree,
        ...(input.department !== undefined
          ? { department: input.department }
          : {}),
        major: input.major,
        ...(input.cgpa !== undefined ? { cgpa: input.cgpa } : {}),
        graduationYear: input.graduationYear,
      },
      metadata: {
        schema: input.schemaName,
        schemaVersion: input.schemaVersion,
      },
    };
  }

  canonicalize(value: unknown): string {
    return JSON.stringify(this.sortValue(value));
  }

  hashCredential(unsignedCredential: unknown): string {
    const canonicalCredential = this.canonicalize(unsignedCredential);

    return this.hashingService.sha256(canonicalCredential);
  }

  private sortValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortValue(item));
    }

    if (typeof value === 'object' && value !== null) {
      const object = value as Record<string, unknown>;

      return Object.keys(object)
        .sort()
        .reduce<Record<string, unknown>>((result, key) => {
          result[key] = this.sortValue(object[key]);
          return result;
        }, {});
    }

    return value;
  }
}
