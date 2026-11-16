import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  ApiProtectedEndpoint,
  ApiPublicEndpoint,
} from '../common/swagger/api-endpoint.decorator';
import { UserRole } from '../generated/prisma/enums';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  getRefreshTokenCookieOptions,
  REFRESH_TOKEN_COOKIE_NAME,
} from './auth-cookie';
import type { AuthenticatedRequest } from './guards/jwt-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

function extractRefreshToken(request: Request): string | null {
  const token: unknown = request.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

  return typeof token === 'string' && token.length > 0 ? token : null;
}

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private getCookieOptions() {
    return getRefreshTokenCookieOptions(
      this.configService.getOrThrow<string>('NODE_ENV') === 'production',
    );
  }

  private setRefreshCookie(
    response: Response,
    token: string,
    expiresAt: Date,
  ): void {
    response.cookie(REFRESH_TOKEN_COOKIE_NAME, token, {
      ...this.getCookieOptions(),
      expires: expiresAt,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_TOKEN_COOKIE_NAME, this.getCookieOptions());
  }

  @ApiPublicEndpoint('Register a new credential holder', 201)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.registerHolder(dto);
  }

  @ApiPublicEndpoint('Authenticate user and issue access token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto);

    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @ApiPublicEndpoint('Rotate refresh token and restore authenticated session')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = extractRefreshToken(request);

    if (!refreshToken) {
      this.clearRefreshCookie(response);
      throw new UnauthorizedException('Refresh token is missing');
    }

    try {
      const result = await this.authService.refresh({
        refreshToken,
      });

      this.setRefreshCookie(
        response,
        result.refreshToken,
        result.refreshTokenExpiresAt,
      );

      return {
        accessToken: result.accessToken,
        user: result.user,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.clearRefreshCookie(response);
      }

      throw error;
    }
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
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = extractRefreshToken(request);

    await this.authService.logout(request.user.sub, refreshToken ?? undefined);

    this.clearRefreshCookie(response);
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
