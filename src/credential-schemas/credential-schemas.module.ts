import { Module } from '@nestjs/common';
import { CredentialSchemasService } from './credential-schemas.service';

@Module({
  providers: [CredentialSchemasService],
  exports: [CredentialSchemasService],
})
export class CredentialSchemasModule {}
