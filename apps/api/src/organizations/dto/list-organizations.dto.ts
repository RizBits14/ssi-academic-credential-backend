import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  OrganizationStatus,
  OrganizationType,
} from '../../generated/prisma/enums';

export class ListOrganizationsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search organizations by name or slug',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }

    return value.trim();
  })
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    enum: Object.values(OrganizationType),
    enumName: 'OrganizationType',
  })
  @IsOptional()
  @IsEnum(OrganizationType)
  type?: OrganizationType;

  @ApiPropertyOptional({
    enum: Object.values(OrganizationStatus),
    enumName: 'OrganizationStatus',
  })
  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;
}
