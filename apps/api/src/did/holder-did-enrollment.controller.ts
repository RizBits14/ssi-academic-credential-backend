import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApiProtectedEndpoint } from '../common/swagger/api-endpoint.decorator';
import { UserRole } from '../generated/prisma/enums';
import {
  BeginHolderKeyEnrollmentDto,
  CompleteHolderKeyEnrollmentDto,
} from './dto/holder-key-enrollment.dto';
import { HolderDidEnrollmentService } from './holder-did-enrollment.service';

@ApiTags('did')
@Controller('dids/me/client-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.HOLDER)
export class HolderDidEnrollmentController {
  constructor(private readonly enrollment: HolderDidEnrollmentService) {}

  @ApiProtectedEndpoint('Begin client-controlled holder DID enrollment', 201)
  @Post('challenge')
  begin(
    @Req() request: AuthenticatedRequest,
    @Body() body: BeginHolderKeyEnrollmentDto,
  ) {
    return this.enrollment.begin(request.user.sub, body.publicKeyPem);
  }

  @ApiProtectedEndpoint('Complete client-controlled holder DID enrollment', 201)
  @Post('complete')
  complete(
    @Req() request: AuthenticatedRequest,
    @Body() body: CompleteHolderKeyEnrollmentDto,
  ) {
    return this.enrollment.complete(
      request.user.sub,
      body.challengeId,
      body.signature,
    );
  }
}
