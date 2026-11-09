import {
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class BeginHolderKeyEnrollmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  publicKeyPem!: string;
}

export class CompleteHolderKeyEnrollmentDto {
  @IsUUID()
  challengeId!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{86}$/, {
    message: 'signature must be an unpadded base64url Ed25519 signature',
  })
  signature!: string;
}
