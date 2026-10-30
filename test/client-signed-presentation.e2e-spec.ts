import { INestApplication, ValidationPipe } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { DidService } from '../src/did/did.service';
import {
  DidOwnerType,
  TrustedIssuerStatus,
  VerificationRequestStatus,
} from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

function responseData<T>(response: { body: unknown }): T {
  const result = response.body as { success: boolean; data: T };
  expect(result.success).toBe(true);
  return result.data;
}

function multibaseSignature(bytes: Uint8Array): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = 0n;

  for (const byte of bytes) {
    value = value * 256n + BigInt(byte);
  }

  let encoded = '';

  while (value > 0n) {
    encoded = alphabet[Number(value % 58n)] + encoded;
    value /= 58n;
  }

  let leadingZeroes = 0;

  for (const byte of bytes) {
    if (byte !== 0) break;
    leadingZeroes++;
  }

  return `z${'1'.repeat(leadingZeroes)}${encoded}`;
}

type Prepared = {
  presentationId: string;
  signingPayloadBase64url: string;
  proofOptions: { created: string };
};

describe('Client-signed presentation (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let redis: RedisService;

  let holderId = '';
  let issuerDidCreated = '';
  let createdTrustId = '';
  let trustBefore: {
    id: string;
    status: TrustedIssuerStatus;
    suspendedAt: Date | null;
  } | null = null;

  let academicRecordId = '';
  let schemaId = '';
  let jobId = '';
  let credentialId = '';
  let holderToken = '';
  let issuerToken = '';
  let verifierToken = '';
  let otherHolderToken = '';

  const requests: string[] = [];
  const applications: string[] = [];
  const runId = randomUUID().replaceAll('-', '').slice(0, 12);
  const claims = ['degree', 'major', 'cgpa'];
  const holderEmail = `client-signing.${runId}@example.com`;
  const holderPassword = 'ClientSigningTest123!';

  const keys = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { format: 'pem', type: 'spki' },
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  });

  const unrelatedKeys = generateKeyPairSync('ed25519');

  async function login(email: string, password: string): Promise<string> {
    const result = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    return responseData<{ accessToken: string }>(result).accessToken;
  }

  async function newRequest(): Promise<string> {
    const applied = await request(server)
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${holderToken}`)
      .send({ jobId })
      .expect(201);

    const applicationId = responseData<{ id: string }>(applied).id;
    applications.push(applicationId);

    const created = await request(server)
      .post('/api/v1/verification-requests')
      .set('Authorization', `Bearer ${verifierToken}`)
      .send({ applicationId, requestedClaims: claims })
      .expect(201);

    const requestId = responseData<{ requestId: string }>(created).requestId;

    requests.push(requestId);
    return requestId;
  }

  async function prepare(requestId: string): Promise<Prepared> {
    const result = await request(server)
      .post(`/api/v1/verification-requests/${requestId}/prepare-client`)
      .set('Authorization', `Bearer ${holderToken}`)
      .send({ credentialId, approvedClaims: claims })
      .expect(201);

    return responseData<Prepared>(result);
  }

  function approvalBody(prepared: Prepared, wrongKey = false) {
    const signature = sign(
      null,
      Buffer.from(prepared.signingPayloadBase64url, 'base64url'),
      wrongKey ? unrelatedKeys.privateKey : keys.privateKey,
    );

    return {
      credentialId,
      approvedClaims: claims,
      presentationId: prepared.presentationId,
      created: prepared.proofOptions.created,
      proofValue: multibaseSignature(signature),
    };
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    const seedPassword = process.env.SEED_DEFAULT_PASSWORD;

    if (!seedPassword) {
      throw new Error('SEED_DEFAULT_PASSWORD is required');
    }

    const university = await prisma.organization.findUnique({
      where: { slug: 'example-university' },
    });

    const bank = await prisma.organization.findUnique({
      where: { slug: 'example-bank' },
    });

    const administrator = await prisma.user.findUnique({
      where: { email: 'system.admin@example.com' },
    });

    if (!university || !bank || !administrator) {
      throw new Error('Seeded test fixtures are missing');
    }

    let issuerDid = await prisma.did.findUnique({
      where: {
        ownerType_ownerId: {
          ownerType: DidOwnerType.ORGANIZATION,
          ownerId: university.id,
        },
      },
    });

    if (!issuerDid) {
      const created = await app
        .get(DidService)
        .createForOrganization(university.id);

      issuerDidCreated = created.id;

      issuerDid = await prisma.did.findUnique({
        where: { id: created.id },
      });
    }

    if (!issuerDid) {
      throw new Error('University DID is missing');
    }

    const trust = await prisma.trustedIssuer.findUnique({
      where: { issuerDid: issuerDid.did },
    });

    if (trust) {
      trustBefore = {
        id: trust.id,
        status: trust.status,
        suspendedAt: trust.suspendedAt,
      };

      await prisma.trustedIssuer.update({
        where: { id: trust.id },
        data: {
          status: TrustedIssuerStatus.TRUSTED,
          suspendedAt: null,
        },
      });
    } else {
      const created = await prisma.trustedIssuer.create({
        data: {
          organizationId: university.id,
          issuerDid: issuerDid.did,
          approvedBy: administrator.id,
          status: TrustedIssuerStatus.TRUSTED,
        },
      });

      createdTrustId = created.id;
    }

    issuerToken = await login('issuer.admin@example.com', seedPassword);

    verifierToken = await login('verifier.admin@example.com', seedPassword);

    otherHolderToken = await login('applicant@example.com', seedPassword);

    const registered = await request(server)
      .post('/api/v1/auth/register')
      .send({
        name: 'Client Signing Test Holder',
        email: holderEmail,
        password: holderPassword,
      })
      .expect(201);

    holderId = responseData<{ id: string }>(registered).id;
    holderToken = await login(holderEmail, holderPassword);

    const started = await request(server)
      .post('/api/v1/dids/me/client-keys/challenge')
      .set('Authorization', `Bearer ${holderToken}`)
      .send({ publicKeyPem: keys.publicKey })
      .expect(201);

    const challenge = responseData<{
      challengeId: string;
      message: string;
    }>(started);

    const signature = sign(
      null,
      Buffer.from(challenge.message, 'utf8'),
      keys.privateKey,
    ).toString('base64url');

    await request(server)
      .post('/api/v1/dids/me/client-keys/complete')
      .set('Authorization', `Bearer ${holderToken}`)
      .send({
        challengeId: challenge.challengeId,
        signature,
      })
      .expect(201);

    const record = await prisma.academicRecord.create({
      data: {
        universityId: university.id,
        holderId,
        studentId: `CS-${runId}`,
        fullName: 'Client Signing Test Holder',
        degree: 'Bachelor of Science',
        department: 'Computer Science and Engineering',
        major: 'Computer Science',
        cgpa: 3.75,
        graduationYear: 2026,
      },
    });

    academicRecordId = record.id;

    const name = 'ClientSigningCredential';
    const version = `1.0-${runId}`;

    const schema = await prisma.credentialSchema.create({
      data: {
        organizationId: university.id,
        name,
        version,
        schemaJson: {
          name,
          version,
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
      },
    });

    schemaId = schema.id;

    const job = await prisma.job.create({
      data: {
        bankId: bank.id,
        title: `Client Signed E2E ${runId}`,
        description: 'Client-controlled key verification flow',
        requiredClaims: claims,
      },
    });

    jobId = job.id;

    const issued = await request(server)
      .post('/api/v1/credentials/issue')
      .set('Authorization', `Bearer ${issuerToken}`)
      .send({ academicRecordId, schemaId })
      .expect(201);

    credentialId = responseData<{
      credential: { id: string };
    }>(issued).credential.id;
  });

  afterAll(async () => {
    if (!app) return;

    try {
      if (!prisma) return;

      if (redis) {
        for (const id of requests) {
          await redis.delete(`verification-request:${id}`);
        }
      }

      const presentations = requests.length
        ? await prisma.presentation.findMany({
            where: { requestId: { in: requests } },
            select: { id: true },
          })
        : [];

      const ids = presentations.map((value) => value.id);

      if (ids.length) {
        await prisma.verificationResult.deleteMany({
          where: { presentationId: { in: ids } },
        });

        await prisma.presentation.deleteMany({
          where: { id: { in: ids } },
        });
      }

      if (requests.length) {
        await prisma.verificationRequest.deleteMany({
          where: { id: { in: requests } },
        });
      }

      if (applications.length) {
        await prisma.verificationResult.deleteMany({
          where: { applicationId: { in: applications } },
        });

        await prisma.application.deleteMany({
          where: { id: { in: applications } },
        });
      }

      if (jobId) {
        await prisma.job.deleteMany({
          where: { id: jobId },
        });
      }

      if (credentialId) {
        await prisma.credentialStatusHistory.deleteMany({
          where: { credentialId },
        });

        await prisma.walletCredential.deleteMany({
          where: { credentialId },
        });

        await prisma.credential.deleteMany({
          where: { id: credentialId },
        });
      }

      if (academicRecordId) {
        await prisma.academicRecord.deleteMany({
          where: { id: academicRecordId },
        });
      }

      if (schemaId) {
        await prisma.credentialSchema.deleteMany({
          where: { id: schemaId },
        });
      }

      const resourceIds = [
        academicRecordId,
        schemaId,
        jobId,
        credentialId,
        ...requests,
        ...applications,
        ...ids,
      ].filter(Boolean);

      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            ...(holderId ? [{ actorId: holderId }] : []),
            { resourceId: { in: resourceIds } },
          ],
        },
      });

      if (holderId) {
        await prisma.did.deleteMany({
          where: {
            ownerType: DidOwnerType.USER,
            ownerId: holderId,
          },
        });

        await prisma.user.deleteMany({
          where: { id: holderId },
        });
      }

      if (createdTrustId) {
        await prisma.trustedIssuer.deleteMany({
          where: { id: createdTrustId },
        });
      } else if (trustBefore) {
        await prisma.trustedIssuer.update({
          where: { id: trustBefore.id },
          data: {
            status: trustBefore.status,
            suspendedAt: trustBefore.suspendedAt,
          },
        });
      }

      if (issuerDidCreated) {
        await prisma.did.deleteMany({
          where: { id: issuerDidCreated },
        });
      }
    } finally {
      await app.close();
    }
  });

  it('blocks wrong holders and rejects invalid signatures', async () => {
    const id = await newRequest();

    await request(server)
      .post(`/api/v1/verification-requests/${id}/prepare-client`)
      .set('Authorization', `Bearer ${otherHolderToken}`)
      .send({ credentialId, approvedClaims: claims })
      .expect(404);

    const prepared = await prepare(id);

    expect(
      Buffer.from(prepared.signingPayloadBase64url, 'base64url'),
    ).toHaveLength(64);

    await request(server)
      .post(`/api/v1/verification-requests/${id}/approve-client`)
      .set('Authorization', `Bearer ${holderToken}`)
      .send(approvalBody(prepared, true))
      .expect(400);

    await request(server)
      .post(`/api/v1/verification-requests/${id}/approve-client`)
      .set('Authorization', `Bearer ${holderToken}`)
      .send({
        ...approvalBody(prepared),
        approvedClaims: ['degree'],
      })
      .expect(400);

    const stored = await prisma.verificationRequest.findUnique({
      where: { id },
    });

    expect(stored?.status).toBe(VerificationRequestStatus.PENDING);
  });

  it('verifies a client-signed presentation and rejects replay', async () => {
    const id = await newRequest();
    const prepared = await prepare(id);
    const body = approvalBody(prepared);

    const approvedResponse = await request(server)
      .post(`/api/v1/verification-requests/${id}/approve-client`)
      .set('Authorization', `Bearer ${holderToken}`)
      .send(body)
      .expect(201);

    const approved = responseData<{
      presentationId: string;
      status: VerificationRequestStatus;
    }>(approvedResponse);

    expect(approved.status).toBe(VerificationRequestStatus.APPROVED);
    expect(approved.presentationId).toBe(prepared.presentationId);

    const stored = await prisma.presentation.findUnique({
      where: { id: approved.presentationId },
    });

    expect(stored?.holderProof).toEqual(
      expect.objectContaining({ proofValue: body.proofValue }),
    );

    const verifiedResponse = await request(server)
      .post(
        `/api/v1/verification/presentations/${approved.presentationId}/verify`,
      )
      .set('Authorization', `Bearer ${verifierToken}`)
      .expect(201);

    const verified = responseData<{
      verified: boolean;
      checks: Record<string, boolean>;
    }>(verifiedResponse);

    expect(verified.verified).toBe(true);
    expect(verified.checks.holderProofValid).toBe(true);
    expect(verified.checks.issuerSignatureValid).toBe(true);

    await request(server)
      .post(`/api/v1/verification-requests/${id}/approve-client`)
      .set('Authorization', `Bearer ${holderToken}`)
      .send(body)
      .expect(409);

    await request(server)
      .post(
        `/api/v1/verification/presentations/${approved.presentationId}/verify`,
      )
      .set('Authorization', `Bearer ${verifierToken}`)
      .expect(409);
  });

  it('permits only one concurrent approval', async () => {
    const id = await newRequest();
    const prepared = await prepare(id);
    const body = approvalBody(prepared);
    const endpoint = `/api/v1/verification-requests/${id}/approve-client`;

    const responses = await Promise.all([
      request(server)
        .post(endpoint)
        .set('Authorization', `Bearer ${holderToken}`)
        .send(body),
      request(server)
        .post(endpoint)
        .set('Authorization', `Bearer ${holderToken}`)
        .send(body),
    ]);

    expect(responses.map((value) => value.status).sort()).toEqual([201, 409]);

    expect(
      await prisma.presentation.count({
        where: { requestId: id },
      }),
    ).toBe(1);
  });

  it('rejects a client-signed presentation with modified disclosed claims', async () => {
    const id = await newRequest();
    const prepared = await prepare(id);

    await request(server)
      .post(`/api/v1/verification-requests/${id}/approve-client`)
      .set('Authorization', `Bearer ${holderToken}`)
      .send(approvalBody(prepared))
      .expect(201);

    await prisma.presentation.update({
      where: { id: prepared.presentationId },
      data: {
        disclosedClaims: {
          degree: 'Forged Academic Degree',
          major: 'Computer Science',
          cgpa: 3.75,
        },
      },
    });

    await request(server)
      .post(
        `/api/v1/verification/presentations/${prepared.presentationId}/verify`,
      )
      .set('Authorization', `Bearer ${verifierToken}`)
      .expect(422);

    const stored = await prisma.verificationRequest.findUnique({
      where: { id },
    });

    expect(stored?.status).toBe(VerificationRequestStatus.FAILED);

    const result = await prisma.verificationResult.findUnique({
      where: { presentationId: prepared.presentationId },
    });

    expect(result?.finalResult).toBe('FAILED');
    expect(result?.hashValid).toBe(false);
  });

  it('rejects a presentation whose holder signature was replaced', async () => {
    const id = await newRequest();
    const prepared = await prepare(id);

    await request(server)
      .post(`/api/v1/verification-requests/${id}/approve-client`)
      .set('Authorization', `Bearer ${holderToken}`)
      .send(approvalBody(prepared))
      .expect(201);

    await prisma.presentation.update({
      where: { id: prepared.presentationId },
      data: {
        holderProof: {
          ...prepared.proofOptions,
          proofValue: approvalBody(prepared, true).proofValue,
        },
      },
    });

    await request(server)
      .post(
        `/api/v1/verification/presentations/${prepared.presentationId}/verify`,
      )
      .set('Authorization', `Bearer ${verifierToken}`)
      .expect(422);

    const stored = await prisma.verificationRequest.findUnique({
      where: { id },
    });

    expect(stored?.status).toBe(VerificationRequestStatus.FAILED);

    const result = await prisma.verificationResult.findUnique({
      where: { presentationId: prepared.presentationId },
    });

    expect(result?.finalResult).toBe('FAILED');
    expect(result?.holderProofValid).toBe(false);
  });

  it('rejects changes to the signed presentation timestamp', async () => {
    const id = await newRequest();
    const prepared = await prepare(id);
    const body = approvalBody(prepared);

    const modifiedTimestamp = new Date(
      new Date(prepared.proofOptions.created).getTime() + 1000,
    ).toISOString();

    await request(server)
      .post(`/api/v1/verification-requests/${id}/approve-client`)
      .set('Authorization', `Bearer ${holderToken}`)
      .send({
        ...body,
        created: modifiedTimestamp,
      })
      .expect(400);

    const stored = await prisma.verificationRequest.findUnique({
      where: { id },
    });

    expect(stored?.status).toBe(VerificationRequestStatus.PENDING);

    expect(
      await prisma.presentation.count({
        where: { requestId: id },
      }),
    ).toBe(0);
  });

  it('enforces holder and verifier roles on client-signing endpoints', async () => {
    const id = await newRequest();
    const prepared = await prepare(id);

    await request(server)
      .post(`/api/v1/verification-requests/${id}/prepare-client`)
      .set('Authorization', `Bearer ${verifierToken}`)
      .send({ credentialId, approvedClaims: claims })
      .expect(403);

    await request(server)
      .post(`/api/v1/verification-requests/${id}/approve-client`)
      .set('Authorization', `Bearer ${verifierToken}`)
      .send(approvalBody(prepared))
      .expect(403);

    await request(server)
      .post(
        `/api/v1/verification/presentations/${prepared.presentationId}/verify`,
      )
      .set('Authorization', `Bearer ${holderToken}`)
      .expect(403);

    const stored = await prisma.verificationRequest.findUnique({
      where: { id },
    });

    expect(stored?.status).toBe(VerificationRequestStatus.PENDING);
  });
});
