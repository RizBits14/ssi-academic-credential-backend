import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AcademicRecordsModule } from './academic-records/academic-records.module';
import { AuthModule } from './auth/auth.module';
import { CredentialSchemasModule } from './credential-schemas/credential-schemas.module';
import { CredentialsModule } from './credentials/credentials.module';
import { CryptoModule } from './crypto/crypto.module';
import { DidModule } from './did/did.module';
import { HealthModule } from './health/health.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { WalletModule } from './wallet/wallet.module';
import { TrustRegistryModule } from './trust-registry/trust-registry.module';
import { JobsModule } from './jobs/jobs.module';
import { ApplicationsModule } from './applications/applications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
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
  ],
})
export class AppModule {}
