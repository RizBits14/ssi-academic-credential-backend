import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApiProtectedEndpoint } from '../common/swagger/api-endpoint.decorator';
import { UserRole } from '../generated/prisma/enums';
import { ListOrganizationsDto } from './dto/list-organizations.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYSTEM_ADMIN)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @ApiProtectedEndpoint(
    'List organizations with pagination, search and filters',
  )
  @Get()
  findAll(@Query() query: ListOrganizationsDto) {
    return this.organizationsService.findAllPaginated({
      page: query.page,
      limit: query.limit,
      search: query.search,
      type: query.type,
      status: query.status,
    });
  }
}
