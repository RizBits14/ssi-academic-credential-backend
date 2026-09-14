import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { CredentialSchemasController } from './credential-schemas.controller';
import { CredentialSchemasService } from './credential-schemas.service';

@Module({
  imports: [AuthModule, OrganizationsModule],
  controllers: [CredentialSchemasController],
  providers: [CredentialSchemasService],
  exports: [CredentialSchemasService],
})
export class CredentialSchemasModule {}
