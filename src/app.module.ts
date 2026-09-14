import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { CryptoModule } from './crypto/crypto.module';
import { DidModule } from './did/did.module';
import { AcademicRecordsModule } from './academic-records/academic-records.module';
import { CredentialSchemasModule } from './credential-schemas/credential-schemas.module';
import { CredentialsModule } from './credentials/credentials.module';

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
  ],
})
export class AppModule {}
