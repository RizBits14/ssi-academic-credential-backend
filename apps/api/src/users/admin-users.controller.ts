import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApiProtectedEndpoint } from '../common/swagger/api-endpoint.decorator';
import { UserRole } from '../generated/prisma/enums';
import { ListUsersDto } from './dto/list-users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYSTEM_ADMIN)
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiProtectedEndpoint('List users with pagination, search and role filters')
  @Get()
  findAll(@Query() query: ListUsersDto) {
    return this.usersService.findAllPaginated({
      page: query.page,
      limit: query.limit,
      search: query.search,
      role: query.role,
    });
  }

  @ApiProtectedEndpoint(
    'Get user details, organization memberships and recent activity',
  )
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.findAdminDetailsById(id);
  }
}
