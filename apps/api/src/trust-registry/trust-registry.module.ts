import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DidModule } from '../did/did.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { TrustRegistryController } from './trust-registry.controller';
import { TrustRegistryService } from './trust-registry.service';

@Module({
  imports: [AuthModule, DidModule, OrganizationsModule],
  controllers: [TrustRegistryController],
  providers: [TrustRegistryService],
  exports: [TrustRegistryService],
})
export class TrustRegistryModule {}
