import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { DidService } from '../src/did/did.service';
import type { Prisma } from '../src/generated/prisma/client';
import {
  CredentialStatus,
  DidOwnerType,
  EducationVerificationStatus,
  TrustedIssuerStatus,
  VerificationFinalResult,
  VerificationRequestStatus,
} from '../src/generated/prisma/enums';
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

    let universityDid = await didService.findByOwner(
      DidOwnerType.ORGANIZATION,
      universityId,
    );

    if (!universityDid) {
      universityDid = await didService.createForOrganization(universityId);
      createdDidIds.push(universityDid.id);
    }

    universityDidId = universityDid.id;
    universityDidValue = universityDid.did;

    let holderDid = await didService.findByOwner(DidOwnerType.USER, holderId);

    if (!holderDid) {
      holderDid = await didService.createForUser(holderId);
      createdDidIds.push(holderDid.id);
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

      await prisma.auditLog.deleteMany({
        where: {
          createdAt: {
            gte: suiteStartedAt,
          },
          OR: [
            {
              actorId: {
                in: [issuerAdminId, verifierAdminId, holderId],
              },
            },
            {
              resourceId: {
                in: [
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
                ].filter((value) => Boolean(value)),
              },
            },
          ],
        },
      });

      await prisma.refreshToken.deleteMany({
        where: {
          createdAt: {
            gte: suiteStartedAt,
          },
          userId: {
            in: [issuerAdminId, verifierAdminId, holderId],
          },
        },
      });
    } finally {
      await app.close();
    }
  });

  it('reports healthy database and Redis dependencies', async () => {
    const response = await request(httpServer)
      .get('/api/v1/health')
      .expect(200);

    const body = response.body as {
      status: string;
      database: string;
      redis: string;
    };

    expect(body.status).toBe('ok');
    expect(body.database).toBe('connected');
    expect(body.redis).toBe('connected');
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
