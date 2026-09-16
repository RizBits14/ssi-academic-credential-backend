import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

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
import { CredentialsService } from './credentials.service';

interface PrepareCredentialIssuanceInput {
  issuerOrganizationId: string;
  academicRecordId: string;
  schemaId: string;
  expiresAt?: Date;
}

interface IssueCredentialInput extends PrepareCredentialIssuanceInput {
  actorId: string;
}

@Injectable()
export class CredentialIssuanceService {
  constructor(
    private readonly academicRecordsService: AcademicRecordsService,
    private readonly credentialSchemasService: CredentialSchemasService,
    private readonly organizationsService: OrganizationsService,
    private readonly didService: DidService,
    private readonly credentialsService: CredentialsService,
    private readonly prisma: PrismaService,
  ) {}

  async prepare(input: PrepareCredentialIssuanceInput) {
    const organization = await this.organizationsService.findById(
      input.issuerOrganizationId,
    );

    if (!organization) {
      throw new NotFoundException('Issuer organization not found');
    }

    if (organization.type !== OrganizationType.UNIVERSITY) {
      throw new ConflictException(
        'Only a university can issue academic credentials',
      );
    }

    const academicRecord = await this.academicRecordsService.findById(
      input.academicRecordId,
    );

    if (academicRecord.universityId !== organization.id) {
      throw new NotFoundException('Academic record not found');
    }

    const schema = await this.credentialSchemasService.findById(input.schemaId);

    if (schema.organizationId !== organization.id) {
      throw new NotFoundException('Credential schema not found');
    }

    if (schema.status !== 'ACTIVE') {
      throw new ConflictException('Credential schema is not active');
    }

    const issuerDid = await this.didService.findByOwner(
      DidOwnerType.ORGANIZATION,
      organization.id,
    );

    if (!issuerDid) {
      throw new NotFoundException('University DID not found');
    }

    if (issuerDid.status !== DidStatus.ACTIVE) {
      throw new ConflictException('University DID is not active');
    }

    const holderDid = await this.didService.findByOwner(
      DidOwnerType.USER,
      academicRecord.holderId,
    );

    if (!holderDid) {
      throw new NotFoundException('Holder DID not found');
    }

    if (holderDid.status !== DidStatus.ACTIVE) {
      throw new ConflictException('Holder DID is not active');
    }

    const cgpa =
      academicRecord.cgpa === null ? undefined : Number(academicRecord.cgpa);

    const claims: Record<string, unknown> = {
      fullName: academicRecord.fullName,
      studentId: academicRecord.studentId,
      university: organization.name,
      degree: academicRecord.degree,
      department: academicRecord.department,
      major: academicRecord.major,
      cgpa,
      graduationYear: academicRecord.graduationYear,
    };

    this.credentialSchemasService.validateClaims(schema.schemaJson, claims);

    const issuedAt = new Date();

    const unsignedCredential =
      this.credentialsService.buildUnsignedAcademicCredential({
        issuerDid: issuerDid.did,
        issuerName: organization.name,
        holderDid: holderDid.did,
        fullName: academicRecord.fullName,
        studentId: academicRecord.studentId,
        degree: academicRecord.degree,
        department: academicRecord.department ?? undefined,
        major: academicRecord.major,
        cgpa,
        graduationYear: academicRecord.graduationYear,
        schemaName: schema.name,
        schemaVersion: schema.version,
        issuedAt,
      });

    const credentialHash =
      this.credentialsService.hashCredential(unsignedCredential);

    const signedCredential = await this.credentialsService.addIssuerProof(
      organization.id,
      unsignedCredential,
      issuedAt,
    );

    const encryptedWalletCredential =
      this.credentialsService.encryptCredentialForWallet(signedCredential);

    return {
      vcId: unsignedCredential.id,
      issuerOrganizationId: organization.id,
      issuerDid: issuerDid.did,
      holderId: academicRecord.holderId,
      holderDid: holderDid.did,
      schemaId: schema.id,
      academicRecordId: academicRecord.id,
      credentialHash,
      issuedAt,
      expiresAt: input.expiresAt,
      signedCredential,
      encryptedWalletCredential,
    };
  }

  async issue(input: IssueCredentialInput) {
    const prepared = await this.prepare(input);

    return this.prisma.$transaction(async (transaction) => {
      const credential = await transaction.credential.create({
        data: {
          vcId: prepared.vcId,
          issuerOrganizationId: prepared.issuerOrganizationId,
          issuerDid: prepared.issuerDid,
          holderId: prepared.holderId,
          holderDid: prepared.holderDid,
          schemaId: prepared.schemaId,
          academicRecordId: prepared.academicRecordId,
          credentialHash: prepared.credentialHash,
          status: CredentialStatus.ACTIVE,
          issuedAt: prepared.issuedAt,
          expiresAt: prepared.expiresAt,
        },
      });

      const walletCredential = await transaction.walletCredential.create({
        data: {
          holderId: prepared.holderId,
          credentialId: credential.id,
          ciphertext: prepared.encryptedWalletCredential.ciphertext,
          iv: prepared.encryptedWalletCredential.iv,
          authTag: prepared.encryptedWalletCredential.authTag,
        },
      });

      await transaction.credentialStatusHistory.create({
        data: {
          credentialId: credential.id,
          previousStatus: null,
          newStatus: CredentialStatus.ACTIVE,
          changedBy: input.actorId,
          reason: 'Credential issued',
        },
      });

      await transaction.auditLog.create({
        data: {
          actorId: input.actorId,
          organizationId: prepared.issuerOrganizationId,
          action: 'CREDENTIAL_ISSUED',
          resourceType: 'Credential',
          resourceId: credential.id,
          metadata: {
            vcId: prepared.vcId,
            holderId: prepared.holderId,
            academicRecordId: prepared.academicRecordId,
            schemaId: prepared.schemaId,
          },
        },
      });

      return {
        credential,
        walletCredentialId: walletCredential.id,
        signedCredential: prepared.signedCredential,
      };
    });
  }
}
