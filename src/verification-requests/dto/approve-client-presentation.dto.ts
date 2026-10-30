import { IsDateString, IsString, IsUUID, MaxLength } from 'class-validator';

import { ApproveVerificationRequestDto } from './approve-verification-request.dto';

export class ApproveClientPresentationDto extends ApproveVerificationRequestDto {
  @IsUUID()
  presentationId!: string;

  @IsDateString()
  created!: string;

  @IsString()
  @MaxLength(128)
  proofValue!: string;
}
