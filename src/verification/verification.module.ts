import { Module } from '@nestjs/common';

import { CredentialSchemasModule } from '../credential-schemas/credential-schemas.module';
import { DidModule } from '../did/did.module';
import { TrustRegistryModule } from '../trust-registry/trust-registry.module';
import { VerificationService } from './verification.service';

@Module({
  imports: [DidModule, TrustRegistryModule, CredentialSchemasModule],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
