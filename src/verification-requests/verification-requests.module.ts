import { Module } from '@nestjs/common';

import { VerificationRequestsService } from './verification-requests.service';

@Module({
  providers: [VerificationRequestsService],
  exports: [VerificationRequestsService],
})
export class VerificationRequestsModule {}
