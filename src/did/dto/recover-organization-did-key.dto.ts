import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import type { SupportedSignatureAlgorithm } from '../../crypto/signature.service';

const SUPPORTED_DID_KEY_ALGORITHMS = ['Ed25519', 'P-256'] as const;

export class RecoverOrganizationDidKeyDto {
  @ApiPropertyOptional({
    description: 'Reason for recovering the compromised DID key.',
    maxLength: 500,
    example: 'Current signing key is suspected to be compromised.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Signature algorithm for the replacement DID key. If omitted, the current key algorithm is preserved.',
    enum: SUPPORTED_DID_KEY_ALGORITHMS,
    example: 'P-256',
  })
  @IsOptional()
  @IsIn(SUPPORTED_DID_KEY_ALGORITHMS)
  algorithm?: SupportedSignatureAlgorithm;
}
