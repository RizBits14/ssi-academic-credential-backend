import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TrustedIssuerStatus } from '../../generated/prisma/enums';

export class ListTrustedIssuersDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: TrustedIssuerStatus,
  })
  @IsOptional()
  @IsEnum(TrustedIssuerStatus)
  status?: TrustedIssuerStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
