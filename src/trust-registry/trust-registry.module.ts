import { Module } from '@nestjs/common';

import { DidModule } from '../did/did.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { TrustRegistryService } from './trust-registry.service';

@Module({
  imports: [DidModule, OrganizationsModule],
  providers: [TrustRegistryService],
  exports: [TrustRegistryService],
})
export class TrustRegistryModule {}
