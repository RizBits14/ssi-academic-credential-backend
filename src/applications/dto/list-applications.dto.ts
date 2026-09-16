import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  ApplicationStatus,
  EducationVerificationStatus,
} from '../../generated/prisma/enums';

export class ListApplicationsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ApplicationStatus,
  })
  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @ApiPropertyOptional({
    enum: EducationVerificationStatus,
  })
  @IsOptional()
  @IsEnum(EducationVerificationStatus)
  educationVerificationStatus?: EducationVerificationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  jobId?: string;
}
