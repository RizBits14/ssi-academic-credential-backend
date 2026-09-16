import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import { LoggerModule } from 'nestjs-pino';

import { AcademicRecordsModule } from './academic-records/academic-records.module';
import { ApplicationsModule } from './applications/applications.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CredentialSchemasModule } from './credential-schemas/credential-schemas.module';
import { CredentialsModule } from './credentials/credentials.module';
import { CryptoModule } from './crypto/crypto.module';
import { DidModule } from './did/did.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { TrustRegistryModule } from './trust-registry/trust-registry.module';
import { UsersModule } from './users/users.module';
import { VerificationRequestsModule } from './verification-requests/verification-requests.module';
import { VerificationModule } from './verification/verification.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    LoggerModule.forRoot({
      pinoHttp: {
        level: 'info',

        genReqId: (request, response) => {
          const suppliedRequestId = request.headers['x-request-id'];

          const uuidPattern =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

          const requestId =
            typeof suppliedRequestId === 'string' &&
            uuidPattern.test(suppliedRequestId)
              ? suppliedRequestId
              : randomUUID();

          response.setHeader('X-Request-ID', requestId);

          return requestId;
        },

        customProps: (request) => ({
          requestId: request.id,
        }),

        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.refreshToken',
            'req.body.accessToken',
            'req.body.privateKey',
            'req.body.masterEncryptionKey',
          ],
          censor: '[REDACTED]',
        },
      },
    }),

    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),

    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    CryptoModule,
    DidModule,
    AcademicRecordsModule,
    CredentialSchemasModule,
    CredentialsModule,
    WalletModule,
    TrustRegistryModule,
    JobsModule,
    ApplicationsModule,
    VerificationRequestsModule,
    VerificationModule,
    AuditModule,
  ],

  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
