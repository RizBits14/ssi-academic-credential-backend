import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { EncryptionService } from '../crypto/encryption.service';
import { DidService } from '../did/did.service';
import {
  EducationVerificationStatus,
  VerificationRequestStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import type { Prisma } from '../generated/prisma/client';

interface CreateVerificationRequestInput {
  applicationId: string;
  verifierId: string;
  bankId: string;
  requestedClaims: string[];
}

interface ApproveVerificationRequestInput {
  requestId: string;
  holderId: string;
  credentialId: string;
  approvedClaims: string[];
}

interface VerificationSession {
  applicationId: string;
  holderId: string;
  bankId: string;
  nonce: string;
  requestedClaims: string[];
}

@Injectable()
export class VerificationRequestsService {
  private readonly ttlSeconds = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly encryptionService: EncryptionService,
    private readonly didService: DidService,
  ) {}

  async create(input: CreateVerificationRequestInput) {
    const application = await this.prisma.application.findUnique({
      where: {
        id: input.applicationId,
      },
      include: {
        job: true,
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.job.bankId !== input.bankId) {
      throw new ForbiddenException('Application does not belong to your bank');
    }

    this.validateRequestedClaims(
      input.requestedClaims,
      application.job.requiredClaims,
    );

    const nonce = randomBytes(32).toString('hex');

    const nonceHash = createHash('sha256').update(nonce).digest('hex');

    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    const request = await this.prisma.verificationRequest.create({
      data: {
        applicationId: input.applicationId,
        verifierId: input.verifierId,
        holderId: application.holderId,
        requestedClaims: input.requestedClaims,
        nonceHash,
        status: VerificationRequestStatus.PENDING,
        expiresAt,
      },
    });

    await this.redis.setJson(
      `verification-request:${request.id}`,
      {
        applicationId: input.applicationId,
        holderId: application.holderId,
        bankId: input.bankId,
        nonce,
        requestedClaims: input.requestedClaims,
      },
      this.ttlSeconds,
    );

    await this.prisma.application.update({
      where: {
        id: input.applicationId,
      },
      data: {
        educationVerificationStatus: EducationVerificationStatus.PENDING,
      },
    });

    return {
      requestId: request.id,
      nonce,
      expiresAt: request.expiresAt,
      status: request.status,
      requestedClaims: request.requestedClaims,
    };
  }

  async findOne(id: string) {
    const request = await this.prisma.verificationRequest.findUnique({
      where: {
        id,
      },
      include: {
        application: {
          include: {
            job: {
              include: {
                bank: true,
              },
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Verification request not found');
    }

    return request;
  }

  async approve(input: ApproveVerificationRequestInput) {
    const request = await this.prisma.verificationRequest.findUnique({
      where: {
        id: input.requestId,
      },
    });

    if (!request) {
      throw new NotFoundException('Verification request not found');
    }

    if (request.holderId !== input.holderId) {
      throw new ForbiddenException(
        'You cannot approve this verification request',
      );
    }

    await this.ensurePendingAndActive(
      request.id,
      request.status,
      request.expiresAt,
    );

    const session = await this.redis.getJson<VerificationSession>(
      `verification-request:${request.id}`,
    );

    if (!session) {
      await this.expireRequest(request.id);

      throw new BadRequestException('Verification request has expired');
    }

    if (session.holderId !== input.holderId) {
      throw new ForbiddenException(
        'Verification session does not belong to this holder',
      );
    }

    const approvedClaims = this.validateApprovedClaims(
      input.approvedClaims,
      request.requestedClaims,
    );

    const walletCredential = await this.prisma.walletCredential.findFirst({
      where: {
        credentialId: input.credentialId,
        holderId: input.holderId,
      },
      include: {
        credential: true,
      },
    });

    if (!walletCredential) {
      throw new NotFoundException('Credential not found in holder wallet');
    }

    const decryptedCredential = this.encryptionService.decrypt({
      ciphertext: walletCredential.ciphertext,
      iv: walletCredential.iv,
      authTag: walletCredential.authTag,
    });

    const disclosedClaims = this.extractDisclosedClaims(
      decryptedCredential,
      approvedClaims,
    ) as Prisma.InputJsonObject;

    const presentationId = randomUUID();

    const signingPayload = {
      presentationId,
      requestId: request.id,
      nonce: session.nonce,
      credentialId: input.credentialId,
      disclosedClaims,
    };

    const canonicalPayload = this.canonicalize(signingPayload);

    const presentationHash = createHash('sha256')
      .update(canonicalPayload)
      .digest('hex');

    const holderSignature = await this.didService.signForUser(
      input.holderId,
      canonicalPayload,
    );

    const holderProof: Prisma.InputJsonObject = {
      algorithm: 'Ed25519',
      verificationMethod:
        `${holderSignature.did}` + `#key-${holderSignature.keyVersion}`,
      signature: holderSignature.signature,
    };

    const presentation = await this.prisma.presentation.create({
      data: {
        id: presentationId,
        requestId: request.id,
        credentialId: input.credentialId,
        holderId: input.holderId,
        holderDid: holderSignature.did,
        disclosedClaims,
        nonce: session.nonce,
        presentationHash,
        holderProof,
      },
    });

    await this.prisma.verificationRequest.update({
      where: {
        id: request.id,
      },
      data: {
        status: VerificationRequestStatus.APPROVED,
      },
    });

    return {
      presentationId: presentation.id,
      requestId: request.id,
      status: VerificationRequestStatus.APPROVED,
      disclosedClaims,
    };
  }

  async reject(requestId: string, holderId: string) {
    const request = await this.prisma.verificationRequest.findUnique({
      where: {
        id: requestId,
      },
    });

    if (!request) {
      throw new NotFoundException('Verification request not found');
    }

    if (request.holderId !== holderId) {
      throw new ForbiddenException(
        'You cannot reject this verification request',
      );
    }

    await this.ensurePendingAndActive(
      request.id,
      request.status,
      request.expiresAt,
    );

    const session = await this.redis.getJson<VerificationSession>(
      `verification-request:${request.id}`,
    );

    if (!session) {
      await this.expireRequest(request.id);

      throw new BadRequestException('Verification request has expired');
    }

    const updated = await this.prisma.verificationRequest.update({
      where: {
        id: request.id,
      },
      data: {
        status: VerificationRequestStatus.REJECTED,
      },
    });

    await this.redis.delete(`verification-request:${request.id}`);

    return {
      requestId: updated.id,
      status: updated.status,
    };
  }

  private async ensurePendingAndActive(
    requestId: string,
    status: VerificationRequestStatus,
    expiresAt: Date,
  ): Promise<void> {
    if (status !== VerificationRequestStatus.PENDING) {
      throw new ConflictException('Verification request is no longer pending');
    }

    if (expiresAt.getTime() <= Date.now()) {
      await this.expireRequest(requestId);

      throw new BadRequestException('Verification request has expired');
    }
  }

  private async expireRequest(requestId: string): Promise<void> {
    await this.prisma.verificationRequest.update({
      where: {
        id: requestId,
      },
      data: {
        status: VerificationRequestStatus.EXPIRED,
      },
    });

    await this.redis.delete(`verification-request:${requestId}`);
  }

  private validateApprovedClaims(
    approvedClaims: string[],
    requestedClaims: unknown,
  ): string[] {
    const normalized = approvedClaims.map((claim) => claim.trim());

    if (
      normalized.length === 0 ||
      normalized.some((claim) => claim.length === 0)
    ) {
      throw new BadRequestException('Approved claims cannot be empty');
    }

    if (new Set(normalized).size !== normalized.length) {
      throw new BadRequestException('Approved claims must be unique');
    }

    if (
      !Array.isArray(requestedClaims) ||
      !requestedClaims.every((claim) => typeof claim === 'string')
    ) {
      throw new BadRequestException('Stored requested claims are invalid');
    }

    const unauthorized = normalized.filter(
      (claim) => !requestedClaims.includes(claim),
    );

    if (unauthorized.length > 0) {
      throw new BadRequestException(
        'Approved claims must be a subset of requested claims',
      );
    }

    return normalized;
  }

  private extractDisclosedClaims(
    credentialJson: string,
    approvedClaims: string[],
  ): Record<string, unknown> {
    let credential: unknown;

    try {
      credential = JSON.parse(credentialJson) as unknown;
    } catch {
      throw new BadRequestException('Stored credential is invalid');
    }

    if (!this.isRecord(credential)) {
      throw new BadRequestException('Stored credential is invalid');
    }

    const credentialSubject = credential.credentialSubject;

    if (!this.isRecord(credentialSubject)) {
      throw new BadRequestException('Credential subject is invalid');
    }

    const disclosedClaims: Record<string, unknown> = {};

    for (const claim of approvedClaims) {
      if (!Object.prototype.hasOwnProperty.call(credentialSubject, claim)) {
        throw new BadRequestException(
          `Credential does not contain claim: ${claim}`,
        );
      }

      disclosedClaims[claim] = credentialSubject[claim];
    }

    return disclosedClaims;
  }

  private validateRequestedClaims(
    requestedClaims: string[],
    requiredClaims: unknown,
  ): void {
    if (requestedClaims.length === 0) {
      throw new BadRequestException('At least one claim must be requested');
    }

    const normalized = requestedClaims.map((claim) => claim.trim());

    if (normalized.some((claim) => claim.length === 0)) {
      throw new BadRequestException('Requested claims cannot be empty');
    }

    if (new Set(normalized).size !== normalized.length) {
      throw new BadRequestException('Requested claims must be unique');
    }

    if (!Array.isArray(requiredClaims)) {
      throw new BadRequestException('Job required claims are invalid');
    }

    const allowedClaims = requiredClaims.filter(
      (claim): claim is string => typeof claim === 'string',
    );

    const unauthorizedClaims = normalized.filter(
      (claim) => !allowedClaims.includes(claim),
    );

    if (unauthorizedClaims.length > 0) {
      throw new BadRequestException(
        'Requested claims must be part of the job required claims',
      );
    }
  }

  private canonicalize(value: unknown): string {
    if (value === null) {
      return 'null';
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return '[' + value.map((item) => this.canonicalize(item)).join(',') + ']';
    }

    if (this.isRecord(value)) {
      const keys = Object.keys(value).sort();

      return (
        '{' +
        keys
          .map(
            (key) => `${JSON.stringify(key)}:` + this.canonicalize(value[key]),
          )
          .join(',') +
        '}'
      );
    }

    throw new BadRequestException('Unable to canonicalize presentation');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
