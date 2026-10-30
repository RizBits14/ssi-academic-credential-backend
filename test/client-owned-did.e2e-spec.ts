import { INestApplication, ValidationPipe } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { DidOwnerType, UserRole } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface AuthSession {
  accessToken: string;
  user: {
    id: string;
    role: UserRole;
  };
}

interface RegisteredHolder {
  id: string;
  role: UserRole;
}

interface EnrollmentChallenge {
  challengeId: string;
  message: string;
}

interface HolderDid {
  id: string;
  did: string;
  ownerId: string;
  currentKeyVersion: number;
}

function getData<T>(response: { body: unknown }): T {
  const body = response.body as ApiSuccess<T>;
  expect(body.success).toBe(true);
  return body.data;
}

describe('Client-owned holder DID enrollment (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  let holderId: string;
  let holderToken: string;
  let issuerToken: string;

  const testId = randomUUID().slice(0, 12);
  const email = `client.did.${testId}@example.com`;
  const password = 'ClientDidTest123!';

  const holderKeys = generateKeyPairSync('ed25519', {
    publicKeyEncoding: {
      format: 'pem',
      type: 'spki',
    },
    privateKeyEncoding: {
      format: 'pem',
      type: 'pkcs8',
    },
  });

  const unrelatedKeys = generateKeyPairSync('ed25519');

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

    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);

    const registerResponse = await request(server)
      .post('/api/v1/auth/register')
      .send({
        name: 'Client DID Test Holder',
        email,
        password,
      })
      .expect(201);

    const registered = getData<RegisteredHolder>(registerResponse);

    holderId = registered.id;
    expect(registered.role).toBe(UserRole.HOLDER);

    const loginResponse = await request(server)
      .post('/api/v1/auth/login')
      .send({
        email,
        password,
      })
      .expect(200);

    const holderSession = getData<AuthSession>(loginResponse);

    holderToken = holderSession.accessToken;
    expect(holderSession.user.id).toBe(holderId);

    const seedPassword = process.env.SEED_DEFAULT_PASSWORD;

    if (!seedPassword) {
      throw new Error('SEED_DEFAULT_PASSWORD is required for E2E tests');
    }

    const issuerLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({
        email: 'issuer.admin@example.com',
        password: seedPassword,
      })
      .expect(200);

    issuerToken = getData<AuthSession>(issuerLogin).accessToken;
  });

  afterAll(async () => {
    if (!app) {
      return;
    }

    try {
      if (prisma && holderId) {
        await prisma.auditLog.deleteMany({
          where: {
            actorId: holderId,
          },
        });

        await prisma.did.deleteMany({
          where: {
            ownerType: DidOwnerType.USER,
            ownerId: holderId,
          },
        });

        await prisma.user.deleteMany({
          where: {
            id: holderId,
          },
        });
      }
    } finally {
      await app.close();
    }
  });

  async function beginEnrollment(): Promise<EnrollmentChallenge> {
    const response = await request(server)
      .post('/api/v1/dids/me/client-keys/challenge')
      .set('Authorization', `Bearer ${holderToken}`)
      .send({
        publicKeyPem: holderKeys.publicKey,
      })
      .expect(201);

    const challenge = getData<EnrollmentChallenge>(response);

    expect(challenge.challengeId).toEqual(expect.any(String));
    expect(challenge.message).toEqual(expect.any(String));

    return challenge;
  }

  it('blocks non-holder users from enrolling a holder DID', async () => {
    await request(server)
      .post('/api/v1/dids/me/client-keys/challenge')
      .set('Authorization', `Bearer ${issuerToken}`)
      .send({
        publicKeyPem: holderKeys.publicKey,
      })
      .expect(403);
  });

  it('rejects an invalid signature and prevents challenge reuse', async () => {
    const challenge = await beginEnrollment();

    const message = Buffer.from(challenge.message, 'utf8');

    const wrongSignature = sign(
      null,
      message,
      unrelatedKeys.privateKey,
    ).toString('base64url');

    const invalidResponse = await request(server)
      .post('/api/v1/dids/me/client-keys/complete')
      .set('Authorization', `Bearer ${holderToken}`)
      .send({
        challengeId: challenge.challengeId,
        signature: wrongSignature,
      });

    expect(invalidResponse.status).toBeGreaterThanOrEqual(400);
    expect(invalidResponse.status).toBeLessThan(500);

    const correctSignature = sign(
      null,
      message,
      holderKeys.privateKey,
    ).toString('base64url');

    const replayResponse = await request(server)
      .post('/api/v1/dids/me/client-keys/complete')
      .set('Authorization', `Bearer ${holderToken}`)
      .send({
        challengeId: challenge.challengeId,
        signature: correctSignature,
      });

    expect(replayResponse.status).toBeGreaterThanOrEqual(400);
    expect(replayResponse.status).toBeLessThan(500);

    const did = await prisma.did.findUnique({
      where: {
        ownerType_ownerId: {
          ownerType: DidOwnerType.USER,
          ownerId: holderId,
        },
      },
    });

    expect(did).toBeNull();
  });

  it('registers a client-owned DID without private-key custody', async () => {
    const challenge = await beginEnrollment();

    const signature = sign(
      null,
      Buffer.from(challenge.message, 'utf8'),
      holderKeys.privateKey,
    ).toString('base64url');

    const response = await request(server)
      .post('/api/v1/dids/me/client-keys/complete')
      .set('Authorization', `Bearer ${holderToken}`)
      .send({
        challengeId: challenge.challengeId,
        signature,
      })
      .expect(201);

    const enrolled = getData<HolderDid>(response);

    expect(enrolled.ownerId).toBe(holderId);
    expect(enrolled.did).toMatch(/^did:mock:holder:/);
    expect(enrolled.currentKeyVersion).toBe(1);

    const storedDid = await prisma.did.findUnique({
      where: {
        ownerType_ownerId: {
          ownerType: DidOwnerType.USER,
          ownerId: holderId,
        },
      },
      include: {
        keys: true,
      },
    });

    expect(storedDid).not.toBeNull();
    expect(storedDid?.keys).toHaveLength(1);

    const storedKey = storedDid?.keys[0];

    expect(storedKey?.publicKey).toBe(holderKeys.publicKey);
    expect(storedKey?.algorithm).toBe('Ed25519');

    expect(storedKey?.encryptedPrivateKey).toBeNull();
    expect(storedKey?.iv).toBeNull();
    expect(storedKey?.authTag).toBeNull();
    expect(storedKey?.encryptionKeyId).toBeNull();

    await request(server)
      .post('/api/v1/dids/me/client-keys/challenge')
      .set('Authorization', `Bearer ${holderToken}`)
      .send({
        publicKeyPem: holderKeys.publicKey,
      })
      .expect(409);
  });
});
