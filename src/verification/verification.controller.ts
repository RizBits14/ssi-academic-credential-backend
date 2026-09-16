import {
  Controller,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApiProtectedEndpoint } from '../common/swagger/api-endpoint.decorator';
import { OrganizationType, UserRole } from '../generated/prisma/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { VerificationService } from './verification.service';

@ApiTags('verification')
@Controller('verification')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VerificationController {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @ApiProtectedEndpoint('Verify a credential presentation', 201)
  @Post('presentations/:presentationId/verify')
  @Roles(UserRole.VERIFIER_ADMIN)
  async verifyPresentation(
    @Req() request: AuthenticatedRequest,
    @Param('presentationId', ParseUUIDPipe) presentationId: string,
  ) {
    const bankId = await this.getBankId(request.user.sub);

    return this.verificationService.verifyPresentation(
      presentationId,
      bankId,
      request.user.sub,
    );
  }

  private async getBankId(userId: string): Promise<string> {
    const membership =
      await this.organizationsService.findMembershipForUser(userId);

    if (!membership || membership.organization.type !== OrganizationType.BANK) {
      throw new NotFoundException('Bank membership not found');
    }

    return membership.organization.id;
  }
}
