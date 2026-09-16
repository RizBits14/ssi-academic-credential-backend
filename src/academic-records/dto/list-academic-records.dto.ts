import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AcademicRecordStatus } from '../../generated/prisma/enums';

export class ListAcademicRecordsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: AcademicRecordStatus,
  })
  @IsOptional()
  @IsEnum(AcademicRecordStatus)
  status?: AcademicRecordStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  holderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentId?: string;
}
