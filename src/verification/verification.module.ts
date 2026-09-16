import { Module } from '@nestjs/common';

import { DidModule } from '../did/did.module';
import { VerificationService } from './verification.service';

@Module({
  imports: [DidModule],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
