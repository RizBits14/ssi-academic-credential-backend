import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class IssueCredentialDto {
  @IsUUID()
  academicRecordId!: string;

  @IsUUID()
  schemaId!: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
