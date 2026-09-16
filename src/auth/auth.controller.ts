import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  ApiProtectedEndpoint,
  ApiPublicEndpoint,
} from '../common/swagger/api-endpoint.decorator';
import { UserRole } from '../generated/prisma/enums';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import type { AuthenticatedRequest } from './guards/jwt-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiPublicEndpoint('Register a new credential holder', 201)
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.registerHolder(dto);
  }

  @ApiPublicEndpoint('Authenticate user and issue tokens')
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @ApiPublicEndpoint('Rotate refresh token and issue new tokens')
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @ApiProtectedEndpoint('Get the currently authenticated user')
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return request.user;
  }

  @ApiProtectedEndpoint('Log out and revoke refresh token', 204)
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RefreshTokenDto,
  ) {
    await this.authService.logout(request.user.sub, dto);
  }

  @ApiProtectedEndpoint('Test holder-only authorization')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOLDER)
  @Get('rbac/holder')
  holderOnly() {
    return {
      message: 'Holder access granted',
    };
  }

  @ApiProtectedEndpoint('Test issuer-only authorization')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ISSUER_ADMIN)
  @Get('rbac/issuer')
  issuerOnly() {
    return {
      message: 'Issuer access granted',
    };
  }
}
