import { Controller, Get, Param } from '@nestjs/common';
import { DidService } from './did.service';

@Controller('dids')
export class DidController {
  constructor(private readonly didService: DidService) {}

  @Get(':did')
  resolve(@Param('did') did: string) {
    return this.didService.resolveDid(did);
  }
}
