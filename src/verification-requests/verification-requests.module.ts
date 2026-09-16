import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { VerificationRequestsController } from './verification-requests.controller';
import { VerificationRequestsService } from './verification-requests.service';
import { DidModule } from '../did/did.module';

@Module({
  imports: [AuthModule, OrganizationsModule, DidModule],
  controllers: [VerificationRequestsController],
  providers: [VerificationRequestsService],
  exports: [VerificationRequestsService],
})
export class VerificationRequestsModule {}
