import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCredentialSchemaDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(1)
  version!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsObject()
  schemaJson!: Record<string, unknown>;
}
