import { Module } from '@nestjs/common';
import { DidModule } from '../did/did.module';
import { CredentialsService } from './credentials.service';

@Module({
  imports: [DidModule],
  providers: [CredentialsService],
  exports: [CredentialsService],
})
export class CredentialsModule {}
