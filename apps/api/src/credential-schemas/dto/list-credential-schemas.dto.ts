import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListCredentialSchemasDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'ACTIVE',
  })
  @IsOptional()
  @IsString()
  status?: string;
}
