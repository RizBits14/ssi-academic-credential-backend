import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import {
  createCipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';

import { AcademicRecordsService } from '../src/academic-records/academic-records.service';
import { AppModule } from '../src/app.module';
import { CredentialSchemasService } from '../src/credential-schemas/credential-schemas.service';
import { CredentialIssuanceService } from '../src/credentials/credential-issuance.service';
import { CredentialsService } from '../src/credentials/credentials.service';
import { EncryptionService } from '../src/crypto/encryption.service';
import { HashingService } from '../src/crypto/hashing.service';
import { SignatureService } from '../src/crypto/signature.service';
import { DidService } from '../src/did/did.service';
import type { Prisma } from '../src/generated/prisma/client';
import {
  CredentialStatus,
  DidKeyStatus,
  DidOwnerType,
  EducationVerificationStatus,
  TrustedIssuerStatus,
  UserRole,
  VerificationFinalResult,
  VerificationRequestStatus,
} from '../src/generated/prisma/enums';
import { OrganizationsService } from '../src/organizations/organizations.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

interface ApiSuccess<T> {
  success: true;
  data: T;
  meta: Record<string, unknown>;
}

interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: string[];
  };
  meta: Record<string, unknown>;
}

interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

interface AcademicRecordResponse {
  id: string;
}

interface CredentialSchemaResponse {
  id: string;
}

interface JobResponse {
  id: string;
}

interface IssuedCredentialResponse {
  credential: {
    id: string;
    status: CredentialStatus;
  };
  walletCredentialId: string;
}

interface ApplicationResponse {
  id: string;
  educationVerificationStatus: EducationVerificationStatus;
  verifiedAcademicData: unknown;
}

interface VerificationRequestResponse {
  requestId: string;
  nonce: string;
  status: VerificationRequestStatus;
}

interface PresentationResponse {
  presentationId: string;
  requestId: string;
  status: VerificationRequestStatus;
}

interface VerificationResponse {
  verified: boolean;
  verificationResultId: string;
  checks: Record<string, boolean>;
  verifiedClaims: Record<string, unknown>;
}

interface DidKeyRotationResponse {
  did: string;
  keyVersion: number;
  verificationMethod: string;
  publicKey: string;
}

interface DidKeyRevocationResponse {
  did: string;
  keyVersion: number;
  verificationMethod: string;
  status: DidKeyStatus;
  revokedAt: string;
}

interface PendingRequestResponse {
  requestId: string;
}

interface WalletCredentialResponse {
  id: string;
  credentialId: string;
  credential: {
    id: string;
    status: CredentialStatus;
  };
}

interface CreatedFlow {
  applicationId: string;
  requestId: string;
  presentationId: string;
}

interface TrustedIssuerSnapshot {
  id: string;
  status: TrustedIssuerStatus;
  suspendedAt: Date | null;
}

function getSuccessData<T>(response: { body: unknown }): T {
  const body = response.body as ApiSuccess<T>;

  expect(body.success).toBe(true);

  return body.data;
}

function getError(response: { body: unknown }): ApiError {
  const body = response.body as ApiError;

  expect(body.success).toBe(false);

  return body;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected an object value');
  }

  return value as Record<string, unknown>;
}

function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function encryptLegacy(
  plaintext: string,
  masterKeyHex: string,
): {
  ciphertext: string;
  iv: string;
  authTag: string;
} {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(masterKeyHex, 'hex'),
    iv,
  );

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }

  if (typeof value === 'object' && value !== null) {
    const object = value as Record<string, unknown>;

    return Object.keys(object)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortValue(object[key]);

        return result;
      }, {});
  }

  return value;
}

describe('SSI Academic Credential API (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let prisma: PrismaService;
  let redis: RedisService;
  let didService: DidService;
  let encryptionService: EncryptionService;

  let seedPassword: string;

  let systemAdminId: string;
  let issuerAdminId: string;
  let verifierAdminId: string;
  let holderId: string;
  let universityId: string;

  let universityDidId: string;
  let universityDidValue: string;
  let holderDidId: string;

  let issuerAuth: AuthSession;
  let verifierAuth: AuthSession;
  let holderAuth: AuthSession;

  let academicRecordId: string;
  let credentialSchemaId: string;
  let jobId: string;
  let verifiedPresentationId: string;
  let verifiedApplicationId: string;

  let trustedIssuerCreatedBySuite = false;
  let trustedIssuerSnapshot: TrustedIssuerSnapshot | null = null;

  const createdDidIds: string[] = [];
  const createdCredentialIds: string[] = [];
  const createdWalletCredentialIds: string[] = [];
  const createdApplicationIds: string[] = [];
  const createdVerificationRequestIds: string[] = [];
  const createdPresentationIds: string[] = [];

  const suiteStartedAt = new Date();
  const runId = randomUUID().replaceAll('-', '').slice(0, 12);
  const requestedClaims = ['degree', 'major', 'cgpa'];

  async function login(email: string): Promise<AuthSession> {
    const response = await request(httpServer)
      .post('/api/v1/auth/login')
      .send({
        email,
        password: seedPassword,
      })
      .expect(200);

    const session = getSuccessData<AuthSession>(response);

    expect(session.accessToken).toEqual(expect.any(String));
    expect(session.refreshToken).toEqual(expect.any(String));
    expect(session.user.email).toBe(email);

    return session;
  }

  async function issueCredential(): Promise<IssuedCredentialResponse> {
    const response = await request(httpServer)
      .post('/api/v1/credentials/issue')
      .set('Authorization', `Bearer ${issuerAuth.accessToken}`)
      .send({
        academicRecordId,
        schemaId: credentialSchemaId,
      })
      .expect(201);

    const issued = getSuccessData<IssuedCredentialResponse>(response);

    expect(issued.credential.status).toBe(CredentialStatus.ACTIVE);

    createdCredentialIds.push(issued.credential.id);
    createdWalletCredentialIds.push(issued.walletCredentialId);

    return issued;
  }

  async function getWalletCredentialDocument(
    walletCredentialId: string,
  ): Promise<Record<string, unknown>> {
    const response = await request(httpServer)
      .get(`/api/v1/wallet/credentials/${walletCredentialId}`)
      .set('Authorization', `Bearer ${holderAuth.accessToken}`)
      .expect(200);

    const walletView = getSuccessData<{
      walletCredentialId: string;
      credential: Record<string, unknown>;
    }>(response);

    expect(walletView.walletCredentialId).toBe(walletCredentialId);

    return walletView.credential;
  }

  async function createPresentation(
    credentialId: string,
  ): Promise<CreatedFlow> {
    const applicationResponse = await request(httpServer)
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${holderAuth.accessToken}`)
      .send({
        jobId,
      })
      .expect(201);

    const application =
      getSuccessData<ApplicationResponse>(applicationResponse);

    createdApplicationIds.push(application.id);

    const requestResponse = await request(httpServer)
      .post('/api/v1/verification-requests')
      .set('Authorization', `Bearer ${verifierAuth.accessToken}`)
      .send({
        applicationId: application.id,
        requestedClaims,
      })
      .expect(201);

    const verificationRequest =
      getSuccessData<VerificationRequestResponse>(requestResponse);

    expect(verificationRequest.status).toBe(VerificationRequestStatus.PENDING);

    createdVerificationRequestIds.push(verificationRequest.requestId);

    const approvalResponse = await request(httpServer)
      .post(
        `/api/v1/verification-requests/${verificationRequest.requestId}/approve`,
      )
      .set('Authorization', `Bearer ${holderAuth.accessToken}`)
      .send({
        credentialId,
        approvedClaims: requestedClaims,
      })
      .expect(201);

    const presentation = getSuccessData<PresentationResponse>(approvalResponse);

    expect(presentation.status).toBe(VerificationRequestStatus.APPROVED);

    createdPresentationIds.push(presentation.presentationId);

    return {
      applicationId: application.id,
      requestId: verificationRequest.requestId,
      presentationId: presentation.presentationId,
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({
      logger: false,
    });

    app.setGlobalPrefix('api/v1');

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    httpServer = app.getHttpServer() as Server;

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    didService = app.get(DidService);
    encryptionService = app.get(EncryptionService);

    seedPassword = process.env.SEED_DEFAULT_PASSWORD ?? '';

    if (!seedPassword) {
      throw new Error(
        'SEED_DEFAULT_PASSWORD is required before running the E2E suite',
      );
    }

    const [systemAdmin, issuerAdmin, verifierAdmin, holder, university] =
      await Promise.all([
        prisma.user.findUnique({
          where: {
            email: 'system.admin@example.com',
          },
        }),
        prisma.user.findUnique({
          where: {
            email: 'issuer.admin@example.com',
          },
        }),
        prisma.user.findUnique({
          where: {
            email: 'verifier.admin@example.com',
          },
        }),
        prisma.user.findUnique({
          where: {
            email: 'applicant@example.com',
          },
        }),
        prisma.organization.findUnique({
          where: {
            slug: 'example-university',
          },
        }),
      ]);

    if (!systemAdmin || !issuerAdmin || !verifierAdmin || !holder) {
      throw new Error('Seeded E2E users are missing. Run the seed first.');
    }

    if (!university) {
      throw new Error('Seeded university is missing. Run the seed first.');
    }

    systemAdminId = systemAdmin.id;
    issuerAdminId = issuerAdmin.id;
    verifierAdminId = verifierAdmin.id;
    holderId = holder.id;
    universityId = university.id;

    let universityDid: { id: string; did: string } | null =
      await prisma.did.findFirst({
        where: {
          ownerType: DidOwnerType.ORGANIZATION,
          ownerId: universityId,
        },
        select: {
          id: true,
          did: true,
        },
      });

    if (!universityDid) {
      const createdUniversityDid =
        await didService.createForOrganization(universityId);

      universityDid = {
        id: createdUniversityDid.id,
        did: createdUniversityDid.did,
      };

      createdDidIds.push(createdUniversityDid.id);
    }

    universityDidId = universityDid.id;
    universityDidValue = universityDid.did;

    let holderDid: { id: string; did: string } | null =
      await prisma.did.findFirst({
        where: {
          ownerType: DidOwnerType.USER,
          ownerId: holderId,
        },
        select: {
          id: true,
          did: true,
        },
      });

    if (!holderDid) {
      const createdHolderDid = await didService.createForUser(holderId);

      holderDid = {
        id: createdHolderDid.id,
        did: createdHolderDid.did,
      };

      createdDidIds.push(createdHolderDid.id);
    }

    holderDidId = holderDid.id;

    const existingTrustedIssuer = await prisma.trustedIssuer.findUnique({
      where: {
        issuerDid: universityDidValue,
      },
    });

    if (existingTrustedIssuer) {
      trustedIssuerSnapshot = {
        id: existingTrustedIssuer.id,
        status: existingTrustedIssuer.status,
        suspendedAt: existingTrustedIssuer.suspendedAt,
      };

      await prisma.trustedIssuer.update({
        where: {
          id: existingTrustedIssuer.id,
        },
        data: {
          status: TrustedIssuerStatus.TRUSTED,
          suspendedAt: null,
        },
      });
    } else {
      const trustedIssuer = await prisma.trustedIssuer.create({
        data: {
          organizationId: universityId,
          issuerDid: universityDidValue,
          approvedBy: systemAdminId,
          status: TrustedIssuerStatus.TRUSTED,
        },
      });

      trustedIssuerCreatedBySuite = true;
      trustedIssuerSnapshot = {
        id: trustedIssuer.id,
        status: trustedIssuer.status,
        suspendedAt: trustedIssuer.suspendedAt,
      };
    }

    issuerAuth = await login('issuer.admin@example.com');
    verifierAuth = await login('verifier.admin@example.com');
    holderAuth = await login('applicant@example.com');

    const academicRecordResponse = await request(httpServer)
      .post('/api/v1/academic-records')
      .set('Authorization', `Bearer ${issuerAuth.accessToken}`)
      .send({
        holderId,
        studentId: `E2E-${runId}`,
        fullName: holder.name,
        degree: 'Bachelor of Science',
        department: 'Computer Science and Engineering',
        major: 'Computer Science',
        cgpa: 3.75,
        graduationYear: 2026,
      })
      .expect(201);

    academicRecordId = getSuccessData<AcademicRecordResponse>(
      academicRecordResponse,
    ).id;

    const schemaName = 'E2EAcademicCredential';
    const schemaVersion = `1.0-${runId}`;

    const credentialSchemaResponse = await request(httpServer)
      .post('/api/v1/credential-schemas')
      .set('Authorization', `Bearer ${issuerAuth.accessToken}`)
      .send({
        name: schemaName,
        version: schemaVersion,
        description: 'E2E academic credential schema',
        schemaJson: {
          name: schemaName,
          version: schemaVersion,
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
      })
      .expect(201);

    credentialSchemaId = getSuccessData<CredentialSchemaResponse>(
      credentialSchemaResponse,
    ).id;

    const jobResponse = await request(httpServer)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${verifierAuth.accessToken}`)
      .send({
        title: `E2E Graduate Engineer ${runId}`,
        description: 'E2E verification job',
        requiredClaims: requestedClaims,
      })
      .expect(201);

    jobId = getSuccessData<JobResponse>(jobResponse).id;
  });

  afterAll(async () => {
    if (!app) {
      return;
    }

    if (!prisma || !redis) {
      await app.close();
      return;
    }

    try {
      for (const requestId of createdVerificationRequestIds) {
        await redis.delete(`verification-request:${requestId}`);
      }

      if (createdPresentationIds.length > 0) {
        await prisma.verificationResult.deleteMany({
          where: {
            presentationId: {
              in: createdPresentationIds,
            },
          },
        });

        await prisma.presentation.deleteMany({
          where: {
            id: {
              in: createdPresentationIds,
            },
          },
        });
      }

      if (createdVerificationRequestIds.length > 0) {
        await prisma.verificationRequest.deleteMany({
          where: {
            id: {
              in: createdVerificationRequestIds,
            },
          },
        });
      }

      if (createdApplicationIds.length > 0) {
        await prisma.verificationResult.deleteMany({
          where: {
            applicationId: {
              in: createdApplicationIds,
            },
          },
        });

        await prisma.application.deleteMany({
          where: {
            id: {
              in: createdApplicationIds,
            },
          },
        });
      }

      if (jobId) {
        await prisma.job.deleteMany({
          where: {
            id: jobId,
          },
        });
      }

      if (createdCredentialIds.length > 0) {
        await prisma.credentialStatusHistory.deleteMany({
          where: {
            credentialId: {
              in: createdCredentialIds,
            },
          },
        });

        await prisma.walletCredential.deleteMany({
          where: {
            credentialId: {
              in: createdCredentialIds,
            },
          },
        });

        await prisma.credential.deleteMany({
          where: {
            id: {
              in: createdCredentialIds,
            },
          },
        });
      }

      if (academicRecordId) {
        await prisma.academicRecord.deleteMany({
          where: {
            id: academicRecordId,
          },
        });
      }

      if (credentialSchemaId) {
        await prisma.credentialSchema.deleteMany({
          where: {
            id: credentialSchemaId,
          },
        });
      }

      if (trustedIssuerSnapshot) {
        if (trustedIssuerCreatedBySuite) {
          await prisma.trustedIssuer.deleteMany({
            where: {
              id: trustedIssuerSnapshot.id,
            },
          });
        } else {
          await prisma.trustedIssuer.update({
            where: {
              id: trustedIssuerSnapshot.id,
            },
            data: {
              status: trustedIssuerSnapshot.status,
              suspendedAt: trustedIssuerSnapshot.suspendedAt,
            },
          });
        }
      }

      if (createdDidIds.length > 0) {
        await prisma.did.deleteMany({
          where: {
            id: {
              in: createdDidIds,
            },
          },
        });
      }

      const cleanupUserIds = [issuerAdminId, verifierAdminId, holderId].filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      );

      const cleanupResourceIds = [
        academicRecordId,
        credentialSchemaId,
        jobId,
        universityDidId,
        holderDidId,
        ...createdCredentialIds,
        ...createdWalletCredentialIds,
        ...createdApplicationIds,
        ...createdVerificationRequestIds,
        ...createdPresentationIds,
      ].filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      );

      if (cleanupUserIds.length > 0 || cleanupResourceIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            createdAt: {
              gte: suiteStartedAt,
            },
            OR: [
              ...(cleanupUserIds.length > 0
                ? [
                    {
                      actorId: {
                        in: cleanupUserIds,
                      },
                    },
                  ]
                : []),
              ...(cleanupResourceIds.length > 0
                ? [
                    {
                      resourceId: {
                        in: cleanupResourceIds,
                      },
                    },
                  ]
                : []),
            ],
          },
        });
      }

      if (cleanupUserIds.length > 0) {
        await prisma.refreshToken.deleteMany({
          where: {
            createdAt: {
              gte: suiteStartedAt,
            },
            userId: {
              in: cleanupUserIds,
            },
          },
        });

        await prisma.refreshTokenFamily.deleteMany({
          where: {
            createdAt: {
              gte: suiteStartedAt,
            },
            userId: {
              in: cleanupUserIds,
            },
          },
        });
      }
    } finally {
      await app.close();
    }
  });

  it('reports API liveness and dependency readiness', async () => {
    const livenessResponse = await request(httpServer)
      .get('/api/v1/health/live')
      .expect(200);

    const livenessBody = livenessResponse.body as {
      status: string;
      timestamp: string;
    };

    expect(livenessBody.status).toBe('ok');
    expect(livenessBody.timestamp).toEqual(expect.any(String));

    const readinessResponse = await request(httpServer)
      .get('/api/v1/health/ready')
      .expect(200);

    const readinessBody = readinessResponse.body as {
      status: string;
      database: string;
      redis: string;
      timestamp: string;
    };

    expect(readinessBody.status).toBe('ok');
    expect(readinessBody.database).toBe('connected');
    expect(readinessBody.redis).toBe('connected');
    expect(readinessBody.timestamp).toEqual(expect.any(String));

    const legacyResponse = await request(httpServer)
      .get('/api/v1/health')
      .expect(200);

    const legacyBody = legacyResponse.body as {
      status: string;
      database: string;
      redis: string;
    };

    expect(legacyBody.status).toBe('ok');
    expect(legacyBody.database).toBe('connected');
    expect(legacyBody.redis).toBe('connected');
  });

  it('enforces authentication and role-based access control', async () => {
    expect(issuerAuth.user.role).toBe('ISSUER_ADMIN');
    expect(verifierAuth.user.role).toBe('VERIFIER_ADMIN');
    expect(holderAuth.user.role).toBe('HOLDER');

    const unauthorizedResponse = await request(httpServer)
      .get('/api/v1/wallet/credentials')
      .expect(401);

    expect(getError(unauthorizedResponse).error.code).toBe(
      'AUTH_TOKEN_REQUIRED',
    );

    const forbiddenResponse = await request(httpServer)
      .post('/api/v1/academic-records')
      .set('Authorization', `Bearer ${holderAuth.accessToken}`)
      .send({
        holderId,
        studentId: `FORBIDDEN-${runId}`,
        fullName: 'Forbidden User',
        degree: 'Bachelor of Science',
        major: 'Computer Science',
        graduationYear: 2026,
      })
      .expect(403);

    expect(getError(forbiddenResponse).error.code).toBe('ACCESS_DENIED');

    const invalidLoginResponse = await request(httpServer)
      .post('/api/v1/auth/login')
      .send({
        email: 'issuer.admin@example.com',
        password: 'definitely-wrong-password',
      })
      .expect(401);

    expect(getError(invalidLoginResponse).error.code).toBe(
      'AUTH_INVALID_CREDENTIALS',
    );
  });

  it('revokes the refresh-token family after concurrent reuse of the same parent token', async () => {
    const isolatedSession = await login('applicant@example.com');

    const parentTokenHash = createHash('sha256')
      .update(isolatedSession.refreshToken)
      .digest('hex');

    const parentTokenBeforeRace = await prisma.refreshToken.findUnique({
      where: {
        tokenHash: parentTokenHash,
      },
      select: {
        userId: true,
        familyId: true,
        revokedAt: true,
        family: {
          select: {
            revokedAt: true,
          },
        },
      },
    });

    if (!parentTokenBeforeRace) {
      throw new Error('Refresh-token fixture is unavailable');
    }

    expect(parentTokenBeforeRace.userId).toBe(holderId);
    expect(parentTokenBeforeRace.revokedAt).toBeNull();
    expect(parentTokenBeforeRace.family.revokedAt).toBeNull();

    const [firstResponse, secondResponse] = await Promise.all([
      request(httpServer).post('/api/v1/auth/refresh').send({
        refreshToken: isolatedSession.refreshToken,
      }),
      request(httpServer).post('/api/v1/auth/refresh').send({
        refreshToken: isolatedSession.refreshToken,
      }),
    ]);

    const responses = [firstResponse, secondResponse];
    const successfulResponses = responses.filter(
      (response) => response.status === 200,
    );
    const rejectedResponses = responses.filter(
      (response) => response.status === 401,
    );

    expect(successfulResponses).toHaveLength(1);
    expect(rejectedResponses).toHaveLength(1);

    const successfulResponse = successfulResponses[0];

    if (!successfulResponse) {
      throw new Error('Concurrent refresh did not produce a winner');
    }

    const rotatedTokens = getSuccessData<{
      accessToken: string;
      refreshToken: string;
    }>(successfulResponse);

    expect(rotatedTokens.accessToken).toEqual(expect.any(String));
    expect(rotatedTokens.refreshToken).toEqual(expect.any(String));
    expect(rotatedTokens.refreshToken).not.toBe(isolatedSession.refreshToken);

    const rejectedResponse = rejectedResponses[0];

    if (!rejectedResponse) {
      throw new Error('Concurrent refresh did not reject replay');
    }

    expect(getError(rejectedResponse).success).toBe(false);

    const childTokenHash = createHash('sha256')
      .update(rotatedTokens.refreshToken)
      .digest('hex');

    const [parentTokenAfterRace, childTokenAfterRace, familyAfterRace] =
      await Promise.all([
        prisma.refreshToken.findUnique({
          where: {
            tokenHash: parentTokenHash,
          },
          select: {
            familyId: true,
            revokedAt: true,
          },
        }),
        prisma.refreshToken.findUnique({
          where: {
            tokenHash: childTokenHash,
          },
          select: {
            userId: true,
            familyId: true,
            revokedAt: true,
          },
        }),
        prisma.refreshTokenFamily.findUnique({
          where: {
            id: parentTokenBeforeRace.familyId,
          },
          select: {
            revokedAt: true,
          },
        }),
      ]);

    expect(parentTokenAfterRace?.revokedAt).toBeInstanceOf(Date);
    expect(familyAfterRace?.revokedAt).toBeInstanceOf(Date);

    expect(childTokenAfterRace).not.toBeNull();
    expect(childTokenAfterRace?.userId).toBe(holderId);
    expect(childTokenAfterRace?.familyId).toBe(parentTokenBeforeRace.familyId);
    expect(childTokenAfterRace?.revokedAt).toBeInstanceOf(Date);

    const childReplayResponse = await request(httpServer)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: rotatedTokens.refreshToken,
      })
      .expect(401);

    expect(getError(childReplayResponse).success).toBe(false);
  });

  it('completes the full credential-to-bank verification workflow', async () => {
    const issued = await issueCredential();

    const walletListResponse = await request(httpServer)
      .get('/api/v1/wallet/credentials?page=1&limit=20')
      .set('Authorization', `Bearer ${holderAuth.accessToken}`)
      .expect(200);

    const walletCredentials =
      getSuccessData<WalletCredentialResponse[]>(walletListResponse);

    expect(
      walletCredentials.some(
        (walletCredential) =>
          walletCredential.credentialId === issued.credential.id,
      ),
    ).toBe(true);

    const walletViewResponse = await request(httpServer)
      .get(`/api/v1/wallet/credentials/${issued.walletCredentialId}`)
      .set('Authorization', `Bearer ${holderAuth.accessToken}`)
      .expect(200);

    const walletView = getSuccessData<{
      walletCredentialId: string;
      credential: Record<string, unknown>;
    }>(walletViewResponse);

    expect(walletView.walletCredentialId).toBe(issued.walletCredentialId);
    expect(walletView.credential).toHaveProperty('proof');

    const applicationResponse = await request(httpServer)
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${holderAuth.accessToken}`)
      .send({
        jobId,
      })
      .expect(201);

    const application =
      getSuccessData<ApplicationResponse>(applicationResponse);

    createdApplicationIds.push(application.id);
    verifiedApplicationId = application.id;

    const requestResponse = await request(httpServer)
      .post('/api/v1/verification-requests')
      .set('Authorization', `Bearer ${verifierAuth.accessToken}`)
      .send({
        applicationId: application.id,
        requestedClaims,
      })
      .expect(201);

    const verificationRequest =
      getSuccessData<VerificationRequestResponse>(requestResponse);

    createdVerificationRequestIds.push(verificationRequest.requestId);

    const pendingResponse = await request(httpServer)
      .get('/api/v1/wallet/requests?page=1&limit=20')
      .set('Authorization', `Bearer ${holderAuth.accessToken}`)
      .expect(200);

    const pendingRequests =
      getSuccessData<PendingRequestResponse[]>(pendingResponse);

    expect(
      pendingRequests.some(
        (pendingRequest) =>
          pendingRequest.requestId === verificationRequest.requestId,
      ),
    ).toBe(true);

    const approvalResponse = await request(httpServer)
      .post(
        `/api/v1/verification-requests/${verificationRequest.requestId}/approve`,
      )
      .set('Authorization', `Bearer ${holderAuth.accessToken}`)
      .send({
        credentialId: issued.credential.id,
        approvedClaims: requestedClaims,
      })
      .expect(201);

    const presentation = getSuccessData<PresentationResponse>(approvalResponse);

    createdPresentationIds.push(presentation.presentationId);
    verifiedPresentationId = presentation.presentationId;

    const verificationResponse = await request(httpServer)
      .post(
        `/api/v1/verification/presentations/${presentation.presentationId}/verify`,
      )
      .set('Authorization', `Bearer ${verifierAuth.accessToken}`)
      .expect(201);

    const verification =
      getSuccessData<VerificationResponse>(verificationResponse);

    expect(verification.verified).toBe(true);
    expect(verification.verifiedClaims.degree).toBe('Bachelor of Science');
    expect(verification.verifiedClaims.major).toBe('Computer Science');
    expect(verification.verifiedClaims.cgpa).toBe(3.75);

    const verifiedApplicationResponse = await request(httpServer)
      .get(`/api/v1/applications/${application.id}`)
      .set('Authorization', `Bearer ${verifierAuth.accessToken}`)
      .expect(200);

    const verifiedApplication = getSuccessData<ApplicationResponse>(
      verifiedApplicationResponse,
    );

    expect(verifiedApplication.educationVerificationStatus).toBe(
      EducationVerificationStatus.VERIFIED,
    );

    const verifiedAcademicData = asRecord(
      verifiedApplication.verifiedAcademicData,
    );

    expect(verifiedAcademicData.degree).toBe('Bachelor of Science');
    expect(verifiedAcademicData.major).toBe('Computer Science');
    expect(verifiedAcademicData.cgpa).toBe(3.75);

    const requiredAuditActions = [
      'CREDENTIAL_ISSUED',
      'CREDENTIAL_VIEWED',
      'CREDENTIAL_REQUEST_CREATED',
      'CREDENTIAL_REQUEST_APPROVED',
      'PRESENTATION_CREATED',
      'CREDENTIAL_VERIFIED',
    ];

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        createdAt: {
          gte: suiteStartedAt,
        },
        action: {
          in: requiredAuditActions,
        },
      },
      select: {
        action: true,
      },
    });

    const auditActions = new Set(auditLogs.map((auditLog) => auditLog.action));

    for (const action of requiredAuditActions) {
      expect(auditActions.has(action)).toBe(true);
    }
  });

  it('keeps historical issuer credentials verifiable after DID key rotation', async () => {
    const startingDid = await prisma.did.findUnique({
      where: {
        id: universityDidId,
      },
      select: {
        id: true,
        did: true,
        currentKeyVersion: true,
      },
    });

    if (!startingDid) {
      throw new Error('University DID fixture is unavailable');
    }

    const startingKey = await prisma.didKey.findUnique({
      where: {
        didId_version: {
          didId: universityDidId,
          version: startingDid.currentKeyVersion,
        },
      },
      select: {
        version: true,
        status: true,
        retiredAt: true,
        revokedAt: true,
      },
    });

    if (!startingKey || startingKey.status !== DidKeyStatus.ACTIVE) {
      throw new Error('University active DID key fixture is unavailable');
    }

    const oldCredential = await issueCredential();

    const oldCredentialDocument = await getWalletCredentialDocument(
      oldCredential.walletCredentialId,
    );

    const oldProof = asRecord(oldCredentialDocument.proof);
    const oldVerificationMethod = oldProof.verificationMethod;

    expect(oldVerificationMethod).toBe(
      `${startingDid.did}#key-${startingDid.currentKeyVersion}`,
    );

    let rotatedVersion: number | null = null;

    try {
      const rotation = await didService.rotateForOrganization(universityId);

      rotatedVersion = rotation.keyVersion;

      expect(rotation.did).toBe(startingDid.did);
      expect(rotation.keyVersion).toBe(startingDid.currentKeyVersion + 1);
      expect(rotation.verificationMethod).toBe(
        `${startingDid.did}#key-${rotation.keyVersion}`,
      );

      const [retiredKey, activeKey, didAfterRotation] = await Promise.all([
        prisma.didKey.findUnique({
          where: {
            didId_version: {
              didId: universityDidId,
              version: startingDid.currentKeyVersion,
            },
          },
        }),
        prisma.didKey.findUnique({
          where: {
            didId_version: {
              didId: universityDidId,
              version: rotation.keyVersion,
            },
          },
        }),
        prisma.did.findUnique({
          where: {
            id: universityDidId,
          },
          select: {
            currentKeyVersion: true,
          },
        }),
      ]);

      expect(retiredKey?.status).toBe(DidKeyStatus.RETIRED);
      expect(retiredKey?.retiredAt).toBeInstanceOf(Date);
      expect(activeKey?.status).toBe(DidKeyStatus.ACTIVE);
      expect(didAfterRotation?.currentKeyVersion).toBe(rotation.keyVersion);

      const historicalMethod = await didService.resolveVerificationMethod(
        startingDid.did,
        String(oldVerificationMethod),
      );

      expect(historicalMethod.verificationMethod.id).toBe(
        oldVerificationMethod,
      );

      const oldFlow = await createPresentation(oldCredential.credential.id);

      const oldVerificationResponse = await request(httpServer)
        .post(
          `/api/v1/verification/presentations/${oldFlow.presentationId}/verify`,
        )
        .set('Authorization', `Bearer ${verifierAuth.accessToken}`)
        .expect(201);

      const oldVerification = getSuccessData<VerificationResponse>(
        oldVerificationResponse,
      );

      expect(oldVerification.verified).toBe(true);

      const newCredential = await issueCredential();

      const newCredentialDocument = await getWalletCredentialDocument(
        newCredential.walletCredentialId,
      );

      const newProof = asRecord(newCredentialDocument.proof);

      expect(newProof.verificationMethod).toBe(
        `${startingDid.did}#key-${rotation.keyVersion}`,
      );

      const newFlow = await createPresentation(newCredential.credential.id);

      const newVerificationResponse = await request(httpServer)
        .post(
          `/api/v1/verification/presentations/${newFlow.presentationId}/verify`,
        )
        .set('Authorization', `Bearer ${verifierAuth.accessToken}`)
        .expect(201);

      const newVerification = getSuccessData<VerificationResponse>(
        newVerificationResponse,
      );

      expect(newVerification.verified).toBe(true);

      const rotationAudit = await prisma.auditLog.findFirst({
        where: {
          action: 'DID_KEY_ROTATED',
          resourceType: 'DID',
          resourceId: universityDidId,
          createdAt: {
            gte: suiteStartedAt,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      expect(rotationAudit).not.toBeNull();
    } finally {
      const versionToDelete = rotatedVersion;

      if (versionToDelete !== null) {
        await prisma.$transaction(async (transaction) => {
          await transaction.didKey.deleteMany({
            where: {
              didId: universityDidId,
              version: versionToDelete,
            },
          });

          await transaction.didKey.update({
            where: {
              didId_version: {
                didId: universityDidId,
                version: startingKey.version,
              },
            },
            data: {
              status: startingKey.status,
              retiredAt: startingKey.retiredAt,
              revokedAt: startingKey.revokedAt,
            },
          });

          await transaction.did.update({
            where: {
              id: universityDidId,
            },
            data: {
              currentKeyVersion: startingDid.currentKeyVersion,
            },
          });
        });
      }
    }
  });

  it('revokes historical issuer keys and recovers a compromised current issuer key', async () => {
    const startingDid = await prisma.did.findUnique({
      where: {
        id: universityDidId,
      },
      select: {
        id: true,
        did: true,
        currentKeyVersion: true,
      },
    });

    if (!startingDid) {
      throw new Error('University DID fixture is unavailable');
    }

    const startingKey = await prisma.didKey.findUnique({
      where: {
        didId_version: {
          didId: universityDidId,
          version: startingDid.currentKeyVersion,
        },
      },
      select: {
        version: true,
        status: true,
        retiredAt: true,
        revokedAt: true,
      },
    });

    if (!startingKey || startingKey.status !== DidKeyStatus.ACTIVE) {
      throw new Error('University active DID key fixture is unavailable');
    }

    const historicalCredential = await issueCredential();

    const historicalCredentialDocument = await getWalletCredentialDocument(
      historicalCredential.walletCredentialId,
    );

    const historicalProof = asRecord(historicalCredentialDocument.proof);

    expect(historicalProof.verificationMethod).toBe(
      `${startingDid.did}#key-${startingDid.currentKeyVersion}`,
    );

    let rotatedVersion: number | null = null;
    let recoveredVersion: number | null = null;

    try {
      const rotationResponse = await request(httpServer)
        .post('/api/v1/dids/organization/rotate')
        .set('Authorization', `Bearer ${issuerAuth.accessToken}`)
        .expect(201);

      const rotation = getSuccessData<DidKeyRotationResponse>(rotationResponse);

      rotatedVersion = rotation.keyVersion;

      expect(rotation.did).toBe(startingDid.did);
      expect(rotation.keyVersion).toBe(startingDid.currentKeyVersion + 1);
      expect(rotation.verificationMethod).toBe(
        `${startingDid.did}#key-${rotation.keyVersion}`,
      );

      const revocationResponse = await request(httpServer)
        .post(
          `/api/v1/dids/organization/keys/${startingDid.currentKeyVersion}/revoke`,
        )
        .set('Authorization', `Bearer ${issuerAuth.accessToken}`)
        .send({
          reason: 'E2E historical issuer key compromise',
        })
        .expect(201);

      const revocation =
        getSuccessData<DidKeyRevocationResponse>(revocationResponse);

      expect(revocation.did).toBe(startingDid.did);
      expect(revocation.keyVersion).toBe(startingDid.currentKeyVersion);
      expect(revocation.verificationMethod).toBe(
        `${startingDid.did}#key-${startingDid.currentKeyVersion}`,
      );
      expect(revocation.status).toBe(DidKeyStatus.REVOKED);

      const revokedHistoricalKey = await prisma.didKey.findUnique({
        where: {
          didId_version: {
            didId: universityDidId,
            version: startingDid.currentKeyVersion,
          },
        },
      });

      expect(revokedHistoricalKey?.status).toBe(DidKeyStatus.REVOKED);
      expect(revokedHistoricalKey?.revokedAt).toBeInstanceOf(Date);

      const historicalFlow = await createPresentation(
        historicalCredential.credential.id,
      );

      const historicalVerificationResponse = await request(httpServer)
        .post(
          `/api/v1/verification/presentations/${historicalFlow.presentationId}/verify`,
        )
        .set('Authorization', `Bearer ${verifierAuth.accessToken}`)
        .expect(422);

      expect(getError(historicalVerificationResponse).error.code).toBe(
        'BUSINESS_RULE_VIOLATION',
      );

      const historicalResult = await prisma.verificationResult.findUnique({
        where: {
          presentationId: historicalFlow.presentationId,
        },
      });

      expect(historicalResult?.finalResult).toBe(
        VerificationFinalResult.FAILED,
      );

      const compromisedCredential = await issueCredential();

      const compromisedCredentialDocument = await getWalletCredentialDocument(
        compromisedCredential.walletCredentialId,
      );

      const compromisedProof = asRecord(compromisedCredentialDocument.proof);

      expect(compromisedProof.verificationMethod).toBe(
        `${startingDid.did}#key-${rotation.keyVersion}`,
      );

      const recoveryResponse = await request(httpServer)
        .post('/api/v1/dids/organization/recover')
        .set('Authorization', `Bearer ${issuerAuth.accessToken}`)
        .send({
          reason: 'E2E current issuer key compromise',
        })
        .expect(201);

      const recovery = getSuccessData<DidKeyRotationResponse>(recoveryResponse);

      recoveredVersion = recovery.keyVersion;

      expect(recovery.did).toBe(startingDid.did);
      expect(recovery.keyVersion).toBe(rotation.keyVersion + 1);
      expect(recovery.verificationMethod).toBe(
        `${startingDid.did}#key-${recovery.keyVersion}`,
      );

      const [compromisedKey, recoveredKey, didAfterRecovery] =
        await Promise.all([
          prisma.didKey.findUnique({
            where: {
              didId_version: {
                didId: universityDidId,
                version: rotation.keyVersion,
              },
            },
          }),
          prisma.didKey.findUnique({
            where: {
              didId_version: {
                didId: universityDidId,
                version: recovery.keyVersion,
              },
            },
          }),
          prisma.did.findUnique({
            where: {
              id: universityDidId,
            },
            select: {
              currentKeyVersion: true,
            },
          }),
        ]);

      expect(compromisedKey?.status).toBe(DidKeyStatus.REVOKED);
      expect(compromisedKey?.revokedAt).toBeInstanceOf(Date);
      expect(recoveredKey?.status).toBe(DidKeyStatus.ACTIVE);
      expect(didAfterRecovery?.currentKeyVersion).toBe(recovery.keyVersion);

      const compromisedFlow = await createPresentation(
        compromisedCredential.credential.id,
      );

      const compromisedVerificationResponse = await request(httpServer)
        .post(
          `/api/v1/verification/presentations/${compromisedFlow.presentationId}/verify`,
        )
        .set('Authorization', `Bearer ${verifierAuth.accessToken}`)
        .expect(422);

      expect(getError(compromisedVerificationResponse).error.code).toBe(
        'BUSINESS_RULE_VIOLATION',
      );

      const compromisedResult = await prisma.verificationResult.findUnique({
        where: {
          presentationId: compromisedFlow.presentationId,
        },
      });

      expect(compromisedResult?.finalResult).toBe(
        VerificationFinalResult.FAILED,
      );

      const recoveredCredential = await issueCredential();

      const recoveredCredentialDocument = await getWalletCredentialDocument(
        recoveredCredential.walletCredentialId,
      );

      const recoveredProof = asRecord(recoveredCredentialDocument.proof);

      expect(recoveredProof.verificationMethod).toBe(
        `${startingDid.did}#key-${recovery.keyVersion}`,
      );

      const recoveredFlow = await createPresentation(
        recoveredCredential.credential.id,
      );

      const recoveredVerificationResponse = await request(httpServer)
        .post(
          `/api/v1/verification/presentations/${recoveredFlow.presentationId}/verify`,
        )
        .set('Authorization', `Bearer ${verifierAuth.accessToken}`)
        .expect(201);

      const recoveredVerification = getSuccessData<VerificationResponse>(
        recoveredVerificationResponse,
      );

      expect(recoveredVerification.verified).toBe(true);

      const lifecycleAudits = await prisma.auditLog.findMany({
        where: {
          resourceType: 'DID',
          resourceId: universityDidId,
          action: {
            in: ['DID_KEY_REVOKED', 'DID_KEY_RECOVERED'],
          },
          createdAt: {
            gte: suiteStartedAt,
          },
        },
        select: {
          action: true,
          actorId: true,
          organizationId: true,
        },
      });

      const lifecycleActions = new Set(
        lifecycleAudits.map((auditLog) => auditLog.action),
      );

      expect(lifecycleActions.has('DID_KEY_REVOKED')).toBe(true);
      expect(lifecycleActions.has('DID_KEY_RECOVERED')).toBe(true);

      for (const auditLog of lifecycleAudits) {
        expect(auditLog.actorId).toBe(issuerAdminId);
        expect(auditLog.organizationId).toBe(universityId);
      }
    } finally {
      const generatedVersions = [rotatedVersion, recoveredVersion].filter(
        (value): value is number => value !== null,
      );

      if (generatedVersions.length > 0) {
        await prisma.$transaction(async (transaction) => {
          await transaction.didKey.deleteMany({
            where: {
              didId: universityDidId,
              version: {
                in: generatedVersions,
              },
            },
          });

          await transaction.didKey.update({
            where: {
              didId_version: {
                didId: universityDidId,
                version: startingKey.version,
              },
            },
            data: {
              status: startingKey.status,
              retiredAt: startingKey.retiredAt,
              revokedAt: startingKey.revokedAt,
            },
          });

          await transaction.did.update({
            where: {
              id: universityDidId,
            },
            data: {
              currentKeyVersion: startingDid.currentKeyVersion,
            },
          });
        });
      }
    }
  });

  it('allows only one of two concurrent issuer DID rotations to win', async () => {
    const startingDid = await prisma.did.findUnique({
      where: {
        id: universityDidId,
      },
      select: {
        id: true,
        currentKeyVersion: true,
      },
    });

    if (!startingDid) {
      throw new Error('University DID fixture is unavailable');
    }

    const startingKey = await prisma.didKey.findUnique({
      where: {
        didId_version: {
          didId: universityDidId,
          version: startingDid.currentKeyVersion,
        },
      },
      select: {
        version: true,
        status: true,
        retiredAt: true,
        revokedAt: true,
      },
    });

    if (!startingKey || startingKey.status !== DidKeyStatus.ACTIVE) {
      throw new Error('University active DID key fixture is unavailable');
    }

    let generatedVersion: number | null = null;

    try {
      const results = await Promise.allSettled([
        didService.rotateForOrganization(universityId, issuerAdminId),
        didService.rotateForOrganization(universityId, issuerAdminId),
      ]);

      const fulfilled = results.filter(
        (result) => result.status === 'fulfilled',
      );
      const rejected = results.filter((result) => result.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const successfulResult = results.find(
        (result) => result.status === 'fulfilled',
      );

      if (!successfulResult || successfulResult.status !== 'fulfilled') {
        throw new Error('Concurrent rotation did not produce a winner');
      }

      generatedVersion = successfulResult.value.keyVersion;

      expect(generatedVersion).toBe(startingDid.currentKeyVersion + 1);

      const [didAfterRace, previousKey, newKey, didKeys] = await Promise.all([
        prisma.did.findUnique({
          where: {
            id: universityDidId,
          },
          select: {
            currentKeyVersion: true,
          },
        }),
        prisma.didKey.findUnique({
          where: {
            didId_version: {
              didId: universityDidId,
              version: startingDid.currentKeyVersion,
            },
          },
        }),
        prisma.didKey.findUnique({
          where: {
            didId_version: {
              didId: universityDidId,
              version: generatedVersion,
            },
          },
        }),
        prisma.didKey.findMany({
          where: {
            didId: universityDidId,
            version: {
              in: [startingDid.currentKeyVersion, generatedVersion],
            },
          },
          orderBy: {
            version: 'asc',
          },
        }),
      ]);

      expect(didAfterRace?.currentKeyVersion).toBe(generatedVersion);
      expect(previousKey?.status).toBe(DidKeyStatus.RETIRED);
      expect(newKey?.status).toBe(DidKeyStatus.ACTIVE);
      expect(didKeys).toHaveLength(2);
    } finally {
      const versionToDelete = generatedVersion;

      if (versionToDelete !== null) {
        await prisma.$transaction(async (transaction) => {
          await transaction.didKey.deleteMany({
            where: {
              didId: universityDidId,
              version: versionToDelete,
            },
          });

          await transaction.didKey.update({
            where: {
              didId_version: {
                didId: universityDidId,
                version: startingKey.version,
              },
            },
            data: {
              status: startingKey.status,
              retiredAt: startingKey.retiredAt,
              revokedAt: startingKey.revokedAt,
            },
          });

          await transaction.did.update({
            where: {
              id: universityDidId,
            },
            data: {
              currentKeyVersion: startingDid.currentKeyVersion,
            },
          });
        });
      }
    }
  });

  it('allows only one of two concurrent issuer DID recoveries to win', async () => {
    const startingDid = await prisma.did.findUnique({
      where: {
        id: universityDidId,
      },
      select: {
        id: true,
        currentKeyVersion: true,
      },
    });

    if (!startingDid) {
      throw new Error('University DID fixture is unavailable');
    }

    const startingKey = await prisma.didKey.findUnique({
      where: {
        didId_version: {
          didId: universityDidId,
          version: startingDid.currentKeyVersion,
        },
      },
      select: {
        version: true,
        status: true,
        retiredAt: true,
        revokedAt: true,
      },
    });

    if (!startingKey || startingKey.status !== DidKeyStatus.ACTIVE) {
      throw new Error('University active DID key fixture is unavailable');
    }

    let generatedVersion: number | null = null;

    try {
      const results = await Promise.allSettled([
        didService.recoverForOrganization(
          universityId,
          issuerAdminId,
          'Concurrent E2E recovery race',
        ),
        didService.recoverForOrganization(
          universityId,
          issuerAdminId,
          'Concurrent E2E recovery race',
        ),
      ]);

      const fulfilled = results.filter(
        (result) => result.status === 'fulfilled',
      );
      const rejected = results.filter((result) => result.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const successfulResult = results.find(
        (result) => result.status === 'fulfilled',
      );

      if (!successfulResult || successfulResult.status !== 'fulfilled') {
        throw new Error('Concurrent recovery did not produce a winner');
      }

      generatedVersion = successfulResult.value.keyVersion;

      expect(generatedVersion).toBe(startingDid.currentKeyVersion + 1);

      const [didAfterRace, compromisedKey, recoveredKey, didKeys] =
        await Promise.all([
          prisma.did.findUnique({
            where: {
              id: universityDidId,
            },
            select: {
              currentKeyVersion: true,
            },
          }),
          prisma.didKey.findUnique({
            where: {
              didId_version: {
                didId: universityDidId,
                version: startingDid.currentKeyVersion,
              },
            },
          }),
          prisma.didKey.findUnique({
            where: {
              didId_version: {
                didId: universityDidId,
                version: generatedVersion,
              },
            },
          }),
          prisma.didKey.findMany({
            where: {
              didId: universityDidId,
              version: {
                in: [startingDid.currentKeyVersion, generatedVersion],
              },
            },
            orderBy: {
              version: 'asc',
            },
          }),
        ]);

      expect(didAfterRace?.currentKeyVersion).toBe(generatedVersion);
      expect(compromisedKey?.status).toBe(DidKeyStatus.REVOKED);
      expect(recoveredKey?.status).toBe(DidKeyStatus.ACTIVE);
      expect(didKeys).toHaveLength(2);
    } finally {
      const versionToDelete = generatedVersion;

      if (versionToDelete !== null) {
        await prisma.$transaction(async (transaction) => {
          await transaction.didKey.deleteMany({
            where: {
              didId: universityDidId,
              version: versionToDelete,
            },
          });

          await transaction.didKey.update({
            where: {
              didId_version: {
                didId: universityDidId,
                version: startingKey.version,
              },
            },
            data: {
              status: startingKey.status,
              retiredAt: startingKey.retiredAt,
              revokedAt: startingKey.revokedAt,
            },
          });

          await transaction.did.update({
            where: {
              id: universityDidId,
            },
            data: {
              currentKeyVersion: startingDid.currentKeyVersion,
            },
          });
        });
      }
    }
  });

  it('enforces one active DID key per DID at the PostgreSQL level', async () => {
    const issuerDid = await prisma.did.findUnique({
      where: {
        ownerType_ownerId: {
          ownerType: DidOwnerType.ORGANIZATION,
          ownerId: universityId,
        },
      },
      select: {
        id: true,
        currentKeyVersion: true,
      },
    });

    if (!issuerDid) {
      throw new Error('Issuer DID fixture is unavailable');
    }

    const activeBefore = await prisma.didKey.count({
      where: {
        didId: issuerDid.id,
        status: DidKeyStatus.ACTIVE,
      },
    });

    expect(activeBefore).toBe(1);

    const conflictingVersion = issuerDid.currentKeyVersion + 10_000;

    await expect(
      prisma.didKey.create({
        data: {
          didId: issuerDid.id,
          version: conflictingVersion,
          publicKey: 'database-invariant-test-public-key',
          encryptedPrivateKey: 'database-invariant-test-ciphertext',
          iv: 'database-invariant-test-iv',
          authTag: 'database-invariant-test-auth-tag',
          encryptionKeyId: null,
          algorithm: 'Ed25519',
          status: DidKeyStatus.ACTIVE,
        },
      }),
    ).rejects.toThrow();

    const activeAfter = await prisma.didKey.count({
      where: {
        didId: issuerDid.id,
        status: DidKeyStatus.ACTIVE,
      },
    });

    expect(activeAfter).toBe(1);

    const conflictingKey = await prisma.didKey.findUnique({
      where: {
        didId_version: {
          didId: issuerDid.id,
          version: conflictingVersion,
        },
      },
    });

    expect(conflictingKey).toBeNull();
  });

  it('allows only one of two concurrent credential revocations to win', async () => {
    const issued = await issueCredential();

    const revoke = () =>
      request(httpServer)
        .post(`/api/v1/credentials/${issued.credential.id}/revoke`)
        .set('Authorization', `Bearer ${issuerAuth.accessToken}`)
        .send({
          reason: 'E2E concurrent revocation test',
        });

    const [firstResponse, secondResponse] = await Promise.all([
      revoke(),
      revoke(),
    ]);

    expect(
      [firstResponse.status, secondResponse.status].sort((a, b) => a - b),
    ).toEqual([201, 409]);

    const credential = await prisma.credential.findUnique({
      where: {
        id: issued.credential.id,
      },
      select: {
        status: true,
      },
    });

    expect(credential?.status).toBe(CredentialStatus.REVOKED);

    const revocationHistoryCount = await prisma.credentialStatusHistory.count({
      where: {
        credentialId: issued.credential.id,
        newStatus: CredentialStatus.REVOKED,
      },
    });

    expect(revocationHistoryCount).toBe(1);

    const revocationAuditCount = await prisma.auditLog.count({
      where: {
        resourceId: issued.credential.id,
        action: 'CREDENTIAL_REVOKED',
        createdAt: {
          gte: suiteStartedAt,
        },
      },
    });

    expect(revocationAuditCount).toBe(1);
  });

  it('allows only one of two concurrent verification finalizations to win', async () => {
    const issued = await issueCredential();
    const flow = await createPresentation(issued.credential.id);

    const verify = () =>
      request(httpServer)
        .post(
          `/api/v1/verification/presentations/${flow.presentationId}/verify`,
        )
        .set('Authorization', `Bearer ${verifierAuth.accessToken}`);

    const [firstResponse, secondResponse] = await Promise.all([
      verify(),
      verify(),
    ]);

    expect(
      [firstResponse.status, secondResponse.status].sort((a, b) => a - b),
    ).toEqual([201, 409]);

    const verificationResultCount = await prisma.verificationResult.count({
      where: {
        presentationId: flow.presentationId,
      },
    });

    expect(verificationResultCount).toBe(1);

    const requestState = await prisma.verificationRequest.findUnique({
      where: {
        id: flow.requestId,
      },
      select: {
        status: true,
      },
    });

    expect(requestState?.status).toBe(VerificationRequestStatus.VERIFIED);

    const applicationState = await prisma.application.findUnique({
      where: {
        id: flow.applicationId,
      },
      select: {
        educationVerificationStatus: true,
      },
    });

    expect(applicationState?.educationVerificationStatus).toBe(
      EducationVerificationStatus.VERIFIED,
    );

    const verificationAuditCount = await prisma.auditLog.count({
      where: {
        resourceId: flow.presentationId,
        action: 'CREDENTIAL_VERIFIED',
        createdAt: {
          gte: suiteStartedAt,
        },
      },
    });

    expect(verificationAuditCount).toBe(1);
  });

  it('preserves legacy ciphertext and supports versioned encryption-key rotation', async () => {
    const requireEnvironmentValue = (name: string): string => {
      const value = process.env[name];

      if (!value) {
        throw new Error(`${name} is required for the crypto E2E test`);
      }

      return value;
    };

    const masterKeyHex = requireEnvironmentValue('MASTER_ENCRYPTION_KEY');

    const didActiveKeyId = requireEnvironmentValue(
      'DID_ENCRYPTION_ACTIVE_KEY_ID',
    )
      .trim()
      .toLowerCase();

    const walletActiveKeyId = requireEnvironmentValue(
      'WALLET_ENCRYPTION_ACTIVE_KEY_ID',
    )
      .trim()
      .toLowerCase();

    const didActiveEnvironmentKey = `DID_ENCRYPTION_KEY_${didActiveKeyId.toUpperCase()}`;

    const walletActiveEnvironmentKey = `WALLET_ENCRYPTION_KEY_${walletActiveKeyId.toUpperCase()}`;

    const didActiveKeyHex = requireEnvironmentValue(didActiveEnvironmentKey);

    const walletActiveKeyHex = requireEnvironmentValue(
      walletActiveEnvironmentKey,
    );

    expect(didActiveKeyHex).not.toBe(walletActiveKeyHex);

    const temporaryDidKeyId = `e2e_${runId}_did`;
    const temporaryWalletKeyId = `e2e_${runId}_wallet`;

    const temporaryDidEnvironmentKey = `DID_ENCRYPTION_KEY_${temporaryDidKeyId.toUpperCase()}`;

    const temporaryWalletEnvironmentKey = `WALLET_ENCRYPTION_KEY_${temporaryWalletKeyId.toUpperCase()}`;

    const temporaryDidKeyHex = randomBytes(32).toString('hex');
    const temporaryWalletKeyHex = randomBytes(32).toString('hex');

    expect(temporaryDidKeyHex).not.toBe(temporaryWalletKeyHex);

    process.env[temporaryDidEnvironmentKey] = temporaryDidKeyHex;
    process.env[temporaryWalletEnvironmentKey] = temporaryWalletKeyHex;

    let temporaryHolderId: string | null = null;
    let temporaryDidId: string | null = null;

    try {
      const temporaryHolder = await prisma.user.create({
        data: {
          name: 'E2E Crypto Holder',
          email: `e2e.crypto.${runId}@example.com`,
          passwordHash: 'not-used-by-e2e',
          role: UserRole.HOLDER,
        },
        select: {
          id: true,
        },
      });

      temporaryHolderId = temporaryHolder.id;

      const temporaryDid = await didService.createForUser(temporaryHolder.id);

      temporaryDidId = temporaryDid.id;

      const didRecord = await prisma.did.findUnique({
        where: {
          id: temporaryDid.id,
        },
        select: {
          currentKeyVersion: true,
        },
      });

      if (!didRecord) {
        throw new Error('Temporary DID fixture is unavailable');
      }

      const initialDidKey = await prisma.didKey.findUnique({
        where: {
          didId_version: {
            didId: temporaryDid.id,
            version: didRecord.currentKeyVersion,
          },
        },
      });

      if (!initialDidKey) {
        throw new Error('Temporary DID key fixture is unavailable');
      }

      expect(initialDidKey.encryptionKeyId).toBe(didActiveKeyId);

      const privateKeyPlaintext = encryptionService.decryptForDid({
        ciphertext: initialDidKey.encryptedPrivateKey,
        iv: initialDidKey.iv,
        authTag: initialDidKey.authTag,
        keyId: initialDidKey.encryptionKeyId,
      });

      const legacyDidCiphertext = encryptLegacy(
        privateKeyPlaintext,
        masterKeyHex,
      );

      await prisma.didKey.update({
        where: {
          id: initialDidKey.id,
        },
        data: {
          encryptedPrivateKey: legacyDidCiphertext.ciphertext,
          iv: legacyDidCiphertext.iv,
          authTag: legacyDidCiphertext.authTag,
          encryptionKeyId: null,
        },
      });

      try {
        const signatureService = app.get(SignatureService);
        const legacySigningPayload = `legacy-did-${runId}`;

        const legacySignature = await didService.signForUser(
          temporaryHolder.id,
          legacySigningPayload,
        );

        expect(
          signatureService.verify(
            legacySigningPayload,
            legacySignature.signature,
            initialDidKey.publicKey,
          ),
        ).toBe(true);
      } finally {
        await prisma.didKey.update({
          where: {
            id: initialDidKey.id,
          },
          data: {
            encryptedPrivateKey: initialDidKey.encryptedPrivateKey,
            iv: initialDidKey.iv,
            authTag: initialDidKey.authTag,
            encryptionKeyId: initialDidKey.encryptionKeyId,
          },
        });
      }

      const legacyWalletCredential = await issueCredential();

      const initialWalletRow = await prisma.walletCredential.findUnique({
        where: {
          id: legacyWalletCredential.walletCredentialId,
        },
      });

      if (!initialWalletRow) {
        throw new Error('Wallet credential fixture is unavailable');
      }

      expect(initialWalletRow.encryptionKeyId).toBe(walletActiveKeyId);

      const walletPlaintext = encryptionService.decryptForWallet({
        ciphertext: initialWalletRow.ciphertext,
        iv: initialWalletRow.iv,
        authTag: initialWalletRow.authTag,
        keyId: initialWalletRow.encryptionKeyId,
      });

      const expectedWalletDocument = asRecord(
        JSON.parse(walletPlaintext) as unknown,
      );

      const legacyWalletCiphertext = encryptLegacy(
        walletPlaintext,
        masterKeyHex,
      );

      await prisma.walletCredential.update({
        where: {
          id: initialWalletRow.id,
        },
        data: {
          ciphertext: legacyWalletCiphertext.ciphertext,
          iv: legacyWalletCiphertext.iv,
          authTag: legacyWalletCiphertext.authTag,
          encryptionKeyId: null,
        },
      });

      try {
        const legacyWalletDocument = await getWalletCredentialDocument(
          initialWalletRow.id,
        );

        expect(legacyWalletDocument).toEqual(expectedWalletDocument);
      } finally {
        await prisma.walletCredential.update({
          where: {
            id: initialWalletRow.id,
          },
          data: {
            ciphertext: initialWalletRow.ciphertext,
            iv: initialWalletRow.iv,
            authTag: initialWalletRow.authTag,
            encryptionKeyId: initialWalletRow.encryptionKeyId,
          },
        });
      }

      const issuerDid = await prisma.did.findUnique({
        where: {
          ownerType_ownerId: {
            ownerType: DidOwnerType.ORGANIZATION,
            ownerId: universityId,
          },
        },
        select: {
          id: true,
          currentKeyVersion: true,
        },
      });

      if (!issuerDid) {
        throw new Error('Issuer DID fixture is unavailable');
      }

      const issuerDidKey = await prisma.didKey.findUnique({
        where: {
          didId_version: {
            didId: issuerDid.id,
            version: issuerDid.currentKeyVersion,
          },
        },
        select: {
          encryptionKeyId: true,
        },
      });

      if (!issuerDidKey) {
        throw new Error('Issuer DID key fixture is unavailable');
      }

      const rotatedConfigValues: Record<string, string> = {
        MASTER_ENCRYPTION_KEY: masterKeyHex,
        DID_ENCRYPTION_ACTIVE_KEY_ID: temporaryDidKeyId,
        WALLET_ENCRYPTION_ACTIVE_KEY_ID: temporaryWalletKeyId,
        [didActiveEnvironmentKey]: didActiveKeyHex,
        [walletActiveEnvironmentKey]: walletActiveKeyHex,
        [temporaryDidEnvironmentKey]: temporaryDidKeyHex,
        [temporaryWalletEnvironmentKey]: temporaryWalletKeyHex,
      };

      if (issuerDidKey.encryptionKeyId) {
        const issuerKeyEnvironmentName = `DID_ENCRYPTION_KEY_${issuerDidKey.encryptionKeyId.toUpperCase()}`;

        rotatedConfigValues[issuerKeyEnvironmentName] = requireEnvironmentValue(
          issuerKeyEnvironmentName,
        );
      }

      const rotatedConfigService = {
        getOrThrow: <T>(key: string): T => {
          const value = rotatedConfigValues[key];

          if (!value) {
            throw new Error(`Missing rotated crypto configuration: ${key}`);
          }

          return value as T;
        },
      } as ConfigService;

      const rotatedEncryptionService = new EncryptionService(
        rotatedConfigService,
      );

      expect(
        rotatedEncryptionService.decryptForDid({
          ciphertext: initialDidKey.encryptedPrivateKey,
          iv: initialDidKey.iv,
          authTag: initialDidKey.authTag,
          keyId: initialDidKey.encryptionKeyId,
        }),
      ).toBe(privateKeyPlaintext);

      expect(
        rotatedEncryptionService.decryptForWallet({
          ciphertext: initialWalletRow.ciphertext,
          iv: initialWalletRow.iv,
          authTag: initialWalletRow.authTag,
          keyId: initialWalletRow.encryptionKeyId,
        }),
      ).toBe(walletPlaintext);

      const signatureService = app.get(SignatureService);

      const rotatedDidService = new DidService(
        prisma,
        rotatedEncryptionService,
        signatureService,
      );

      const rotatedDid = await rotatedDidService.rotateForUser(
        temporaryHolder.id,
      );

      const rotatedDidKey = await prisma.didKey.findUnique({
        where: {
          didId_version: {
            didId: temporaryDid.id,
            version: rotatedDid.keyVersion,
          },
        },
      });

      if (!rotatedDidKey) {
        throw new Error('Rotated DID key was not persisted');
      }

      expect(rotatedDidKey.encryptionKeyId).toBe(temporaryDidKeyId);

      const rotatedSigningPayload = `rotated-did-${runId}`;

      const rotatedSignature = await didService.signForUser(
        temporaryHolder.id,
        rotatedSigningPayload,
      );

      expect(
        signatureService.verify(
          rotatedSigningPayload,
          rotatedSignature.signature,
          rotatedDidKey.publicKey,
        ),
      ).toBe(true);

      const rotatedCredentialsService = new CredentialsService(
        app.get(HashingService),
        rotatedDidService,
        rotatedEncryptionService,
      );

      const rotatedIssuanceService = new CredentialIssuanceService(
        app.get(AcademicRecordsService),
        app.get(CredentialSchemasService),
        app.get(OrganizationsService),
        rotatedDidService,
        rotatedCredentialsService,
        prisma,
      );

      const versionTwoIssued = await rotatedIssuanceService.issue({
        issuerOrganizationId: universityId,
        academicRecordId,
        schemaId: credentialSchemaId,
        actorId: issuerAdminId,
      });

      createdCredentialIds.push(versionTwoIssued.credential.id);
      createdWalletCredentialIds.push(versionTwoIssued.walletCredentialId);

      const versionTwoWalletRow = await prisma.walletCredential.findUnique({
        where: {
          id: versionTwoIssued.walletCredentialId,
        },
      });

      if (!versionTwoWalletRow) {
        throw new Error('Versioned wallet credential was not persisted');
      }

      expect(versionTwoWalletRow.encryptionKeyId).toBe(temporaryWalletKeyId);

      const versionTwoWalletDocument = await getWalletCredentialDocument(
        versionTwoIssued.walletCredentialId,
      );

      expect(versionTwoWalletDocument).toEqual(
        versionTwoIssued.signedCredential,
      );
    } finally {
      if (temporaryDidId || temporaryHolderId) {
        await prisma.auditLog.deleteMany({
          where: {
            createdAt: {
              gte: suiteStartedAt,
            },
            OR: [
              ...(temporaryHolderId
                ? [
                    {
                      actorId: temporaryHolderId,
                    },
                  ]
                : []),
              ...(temporaryDidId
                ? [
                    {
                      resourceId: temporaryDidId,
                    },
                  ]
                : []),
            ],
          },
        });
      }

      if (temporaryDidId) {
        await prisma.did.deleteMany({
          where: {
            id: temporaryDidId,
          },
        });
      }

      if (temporaryHolderId) {
        await prisma.user.deleteMany({
          where: {
            id: temporaryHolderId,
          },
        });
      }

      delete process.env[temporaryDidEnvironmentKey];
      delete process.env[temporaryWalletEnvironmentKey];
    }
  });

  it('rejects a tampered disclosed CGPA even with a newly signed holder proof', async () => {
    const issued = await issueCredential();
    const flow = await createPresentation(issued.credential.id);

    const presentation = await prisma.presentation.findUnique({
      where: {
        id: flow.presentationId,
      },
    });

    if (!presentation) {
      throw new Error('Presentation was not created');
    }

    const tamperedClaims: Record<string, unknown> = {
      ...asRecord(presentation.disclosedClaims),
      cgpa: 0.01,
    };

    const holderSigningPayload = {
      presentationId: presentation.id,
      requestId: presentation.requestId,
      nonce: presentation.nonce,
      credentialId: presentation.credentialId,
      disclosedClaims: tamperedClaims,
    };

    const canonicalPayload = canonicalize(holderSigningPayload);

    const holderSignature = await didService.signForUser(
      holderId,
      canonicalPayload,
    );

    const presentationHash = createHash('sha256')
      .update(canonicalPayload)
      .digest('hex');

    await prisma.presentation.update({
      where: {
        id: presentation.id,
      },
      data: {
        disclosedClaims: tamperedClaims as Prisma.InputJsonObject,
        presentationHash,
        holderProof: {
          algorithm: 'Ed25519',
          verificationMethod: `${holderSignature.did}#key-${holderSignature.keyVersion}`,
          signature: holderSignature.signature,
        },
      },
    });

    const response = await request(httpServer)
      .post(`/api/v1/verification/presentations/${presentation.id}/verify`)
      .set('Authorization', `Bearer ${verifierAuth.accessToken}`)
      .expect(422);

    expect(getError(response).error.code).toBe('BUSINESS_RULE_VIOLATION');

    const result = await prisma.verificationResult.findUnique({
      where: {
        presentationId: presentation.id,
      },
    });

    expect(result?.finalResult).toBe(VerificationFinalResult.FAILED);
    expect(result?.failureReason).toContain(
      'Disclosed claim does not match credential: cgpa',
    );
  });

  it('rejects a revoked credential during verification', async () => {
    const issued = await issueCredential();
    const flow = await createPresentation(issued.credential.id);

    const revokeResponse = await request(httpServer)
      .post(`/api/v1/credentials/${issued.credential.id}/revoke`)
      .set('Authorization', `Bearer ${issuerAuth.accessToken}`)
      .send({
        reason: 'E2E revoked credential security test',
      })
      .expect(201);

    const revokedCredential = getSuccessData<{
      id: string;
      status: CredentialStatus;
    }>(revokeResponse);

    expect(revokedCredential.status).toBe(CredentialStatus.REVOKED);

    const verificationResponse = await request(httpServer)
      .post(`/api/v1/verification/presentations/${flow.presentationId}/verify`)
      .set('Authorization', `Bearer ${verifierAuth.accessToken}`)
      .expect(422);

    expect(getError(verificationResponse).error.code).toBe(
      'BUSINESS_RULE_VIOLATION',
    );

    const result = await prisma.verificationResult.findUnique({
      where: {
        presentationId: flow.presentationId,
      },
    });

    expect(result?.finalResult).toBe(VerificationFinalResult.FAILED);
    expect(result?.failureReason).toContain('Credential has been revoked');

    const requestState = await prisma.verificationRequest.findUnique({
      where: {
        id: flow.requestId,
      },
    });

    expect(requestState?.status).toBe(VerificationRequestStatus.FAILED);
  });

  it('rejects a credential when its issuer is not trusted', async () => {
    const issued = await issueCredential();
    const flow = await createPresentation(issued.credential.id);

    if (!trustedIssuerSnapshot) {
      throw new Error('Trusted issuer fixture is unavailable');
    }

    await prisma.trustedIssuer.update({
      where: {
        id: trustedIssuerSnapshot.id,
      },
      data: {
        status: TrustedIssuerStatus.SUSPENDED,
        suspendedAt: new Date(),
      },
    });

    try {
      const response = await request(httpServer)
        .post(
          `/api/v1/verification/presentations/${flow.presentationId}/verify`,
        )
        .set('Authorization', `Bearer ${verifierAuth.accessToken}`)
        .expect(422);

      expect(getError(response).error.code).toBe('BUSINESS_RULE_VIOLATION');

      const result = await prisma.verificationResult.findUnique({
        where: {
          presentationId: flow.presentationId,
        },
      });

      expect(result?.finalResult).toBe(VerificationFinalResult.FAILED);
      expect(result?.failureReason).toContain(
        'Credential issuer is not trusted',
      );
    } finally {
      await prisma.trustedIssuer.update({
        where: {
          id: trustedIssuerSnapshot.id,
        },
        data: {
          status: TrustedIssuerStatus.TRUSTED,
          suspendedAt: null,
        },
      });
    }
  });

  it('rejects replay of an already verified presentation', async () => {
    expect(verifiedPresentationId).toEqual(expect.any(String));
    expect(verifiedApplicationId).toEqual(expect.any(String));

    const response = await request(httpServer)
      .post(
        `/api/v1/verification/presentations/${verifiedPresentationId}/verify`,
      )
      .set('Authorization', `Bearer ${verifierAuth.accessToken}`)
      .expect(409);

    expect(getError(response).error.code).toBe('CONFLICT');

    const requestRecord = await prisma.verificationRequest.findFirst({
      where: {
        applicationId: verifiedApplicationId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(requestRecord?.status).toBe(VerificationRequestStatus.VERIFIED);
  });
});
