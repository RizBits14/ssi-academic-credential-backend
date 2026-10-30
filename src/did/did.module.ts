import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { DidController } from './did.controller';
import { DidService } from './did.service';
import { HolderKeyProofService } from './holder-key-proof.service';

@Module({
  imports: [AuthModule, OrganizationsModule],
  controllers: [DidController],
  providers: [DidService, HolderKeyProofService],
  exports: [DidService, HolderKeyProofService],
})
export class DidModule {}
