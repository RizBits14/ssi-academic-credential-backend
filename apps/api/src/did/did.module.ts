import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { DidController } from './did.controller';
import { DidService } from './did.service';
import { HolderDidEnrollmentController } from './holder-did-enrollment.controller';
import { HolderDidEnrollmentService } from './holder-did-enrollment.service';
import { HolderKeyProofService } from './holder-key-proof.service';

@Module({
  imports: [AuthModule, OrganizationsModule],
  controllers: [DidController, HolderDidEnrollmentController],
  providers: [DidService, HolderKeyProofService, HolderDidEnrollmentService],
  exports: [DidService, HolderKeyProofService, HolderDidEnrollmentService],
})
export class DidModule {}
