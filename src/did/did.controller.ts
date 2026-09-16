import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiPublicEndpoint } from '../common/swagger/api-endpoint.decorator';
import { DidService } from './did.service';

@ApiTags('did')
@Controller('dids')
export class DidController {
  constructor(private readonly didService: DidService) {}

  @ApiPublicEndpoint('Resolve a mock DID document')
  @Get(':did')
  resolve(@Param('did') did: string) {
    return this.didService.resolveDid(did);
  }
}
