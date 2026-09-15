import { Module } from '@nestjs/common';

import { AcademicRecordsModule } from '../academic-records/academic-records.module';
import { CredentialSchemasModule } from '../credential-schemas/credential-schemas.module';
import { DidModule } from '../did/did.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { CredentialIssuanceService } from './credential-issuance.service';
import { CredentialsService } from './credentials.service';

@Module({
  imports: [
    AcademicRecordsModule,
    CredentialSchemasModule,
    DidModule,
    OrganizationsModule,
  ],
  providers: [CredentialsService, CredentialIssuanceService],
  exports: [CredentialsService, CredentialIssuanceService],
})
export class CredentialsModule {}
