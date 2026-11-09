import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { HashingService } from './hashing.service';
import { SignatureService } from './signature.service';

@Global()
@Module({
  providers: [EncryptionService, HashingService, SignatureService],
  exports: [EncryptionService, HashingService, SignatureService],
})
export class CryptoModule {}
