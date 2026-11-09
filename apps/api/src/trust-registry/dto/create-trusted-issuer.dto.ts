import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateTrustedIssuerDto {
  @IsUUID()
  organizationId!: string;

  @IsString()
  @IsNotEmpty()
  issuerDid!: string;
}
