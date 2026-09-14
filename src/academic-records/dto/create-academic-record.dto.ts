import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAcademicRecordDto {
  @IsUUID()
  holderId!: string;

  @IsString()
  @MinLength(1)
  studentId!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @MinLength(2)
  degree!: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsString()
  @MinLength(2)
  major!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(4)
  cgpa?: number;

  @IsInt()
  @Min(1900)
  @Max(2100)
  graduationYear!: number;

  @IsOptional()
  @IsDateString()
  graduationDate?: string;
}
