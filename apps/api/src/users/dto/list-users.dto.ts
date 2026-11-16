import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { UserRole } from '../../generated/prisma/enums';

export class ListUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search users by name or email',
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
    enum: Object.values(UserRole),
    enumName: 'UserRole',
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
