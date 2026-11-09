import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ChangeDidKeyDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
