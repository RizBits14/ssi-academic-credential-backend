import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CredentialSchemasModule } from '../credential-schemas/credential-schemas.module';
import { DidModule } from '../did/did.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { TrustRegistryModule } from '../trust-registry/trust-registry.module';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

@Module({
  imports: [
    AuthModule,
    OrganizationsModule,
    DidModule,
    TrustRegistryModule,
    CredentialSchemasModule,
  ],
  controllers: [VerificationController],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
