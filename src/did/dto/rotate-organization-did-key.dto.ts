import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import type { SupportedSignatureAlgorithm } from '../../crypto/signature.service';

const SUPPORTED_DID_KEY_ALGORITHMS = ['Ed25519', 'P-256'] as const;

export class RotateOrganizationDidKeyDto {
  @ApiPropertyOptional({
    description:
      'Signature algorithm for the new DID key. If omitted, the current key algorithm is preserved.',
    enum: SUPPORTED_DID_KEY_ALGORITHMS,
    example: 'P-256',
  })
  @IsOptional()
  @IsIn(SUPPORTED_DID_KEY_ALGORITHMS)
  algorithm?: SupportedSignatureAlgorithm;
}
