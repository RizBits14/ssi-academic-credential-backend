import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
} from 'class-validator';

export class ApproveVerificationRequestDto {
  @IsUUID()
  credentialId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  approvedClaims!: string[];
}
