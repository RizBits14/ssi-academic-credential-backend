import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { OrganizationType, UserRole } from '../generated/prisma/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateVerificationRequestDto } from './dto/create-verification-request.dto';
import { VerificationRequestsService } from './verification-requests.service';

@Controller('verification-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VerificationRequestsController {
  constructor(
    private readonly verificationRequestsService: VerificationRequestsService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Post()
  @Roles(UserRole.VERIFIER_ADMIN)
  async create(
    @Req() request: AuthenticatedRequest,
    @Body()
    dto: CreateVerificationRequestDto,
  ) {
    const bankId = await this.getBankId(request.user.sub);

    return this.verificationRequestsService.create({
      applicationId: dto.applicationId,
      verifierId: request.user.sub,
      bankId,
      requestedClaims: dto.requestedClaims,
    });
  }

  @Get(':id')
  @Roles(UserRole.HOLDER, UserRole.VERIFIER_ADMIN)
  async findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    const verificationRequest =
      await this.verificationRequestsService.findOne(id);

    if (request.user.role === UserRole.HOLDER) {
      if (verificationRequest.holderId !== request.user.sub) {
        throw new ForbiddenException(
          'You cannot access this verification request',
        );
      }

      return verificationRequest;
    }

    if (request.user.role === UserRole.VERIFIER_ADMIN) {
      const bankId = await this.getBankId(request.user.sub);

      if (verificationRequest.application.job.bankId !== bankId) {
        throw new ForbiddenException(
          'You cannot access this verification request',
        );
      }

      return verificationRequest;
    }

    throw new ForbiddenException('You cannot access this verification request');
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
