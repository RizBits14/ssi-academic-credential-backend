import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
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
import { AcademicRecordsService } from './academic-records.service';
import { CreateAcademicRecordDto } from './dto/create-academic-record.dto';
import { ListAcademicRecordsDto } from './dto/list-academic-records.dto';
import { UpdateAcademicRecordDto } from './dto/update-academic-record.dto';

@ApiTags('academic-records')
@Controller('academic-records')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ISSUER_ADMIN)
export class AcademicRecordsController {
  constructor(
    private readonly academicRecordsService: AcademicRecordsService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @ApiProtectedEndpoint('Create an academic record', 201)
  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateAcademicRecordDto,
  ) {
    const universityId = await this.getUniversityId(request.user.sub);

    return this.academicRecordsService.create({
      universityId,
      holderId: dto.holderId,
      studentId: dto.studentId,
      fullName: dto.fullName,
      degree: dto.degree,
      department: dto.department,
      major: dto.major,
      cgpa: dto.cgpa,
      graduationYear: dto.graduationYear,
      graduationDate: dto.graduationDate
        ? new Date(dto.graduationDate)
        : undefined,
      actorId: request.user.sub,
    });
  }

  @ApiProtectedEndpoint(
    'List university academic records with pagination and filters',
  )
  @Get()
  async findAll(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListAcademicRecordsDto,
  ) {
    const universityId = await this.getUniversityId(request.user.sub);

    return this.academicRecordsService.findByUniversityPaginated({
      universityId,
      page: query.page,
      limit: query.limit,
      status: query.status,
      holderId: query.holderId,
      studentId: query.studentId,
    });
  }

  @ApiProtectedEndpoint('Get an academic record')
  @Get(':id')
  async findOne(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const universityId = await this.getUniversityId(request.user.sub);
    const record = await this.academicRecordsService.findById(id);

    if (record.universityId !== universityId) {
      throw new NotFoundException('Academic record not found');
    }

    return record;
  }

  @ApiProtectedEndpoint('Update an academic record')
  @Patch(':id')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAcademicRecordDto,
  ) {
    const universityId = await this.getUniversityId(request.user.sub);
    const record = await this.academicRecordsService.findById(id);

    if (record.universityId !== universityId) {
      throw new NotFoundException('Academic record not found');
    }

    return this.academicRecordsService.update(id, {
      fullName: dto.fullName,
      degree: dto.degree,
      department: dto.department,
      major: dto.major,
      cgpa: dto.cgpa,
      graduationYear: dto.graduationYear,
      graduationDate: dto.graduationDate
        ? new Date(dto.graduationDate)
        : undefined,
      status: dto.status,
    });
  }

  private async getUniversityId(userId: string): Promise<string> {
    const membership =
      await this.organizationsService.findMembershipForUser(userId);

    if (
      !membership ||
      membership.organization.type !== OrganizationType.UNIVERSITY
    ) {
      throw new NotFoundException('University membership not found');
    }

    return membership.organization.id;
  }
}
