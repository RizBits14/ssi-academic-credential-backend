import { Module } from '@nestjs/common';
import { DidService } from './did.service';

@Module({
  providers: [DidService],
  exports: [DidService],
})
export class DidModule {}
