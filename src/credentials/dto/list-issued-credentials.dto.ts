import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CredentialStatus } from '../../generated/prisma/enums';

export class ListIssuedCredentialsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: CredentialStatus,
  })
  @IsOptional()
  @IsEnum(CredentialStatus)
  status?: CredentialStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  holderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  issuedFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  issuedTo?: string;
}
