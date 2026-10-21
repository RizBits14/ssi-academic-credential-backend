import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';

import { UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { RefreshTokenService } from './refresh-token.service';

interface RefreshTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  jti: string;
  familyId: string;
  exp?: number;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async registerHolder(dto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(dto.email);

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const user = await this.usersService.createUser({
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: UserRole.HOLDER,
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await this.passwordService.verify(
      user.passwordHash,
      dto.password,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const familyId = await this.refreshTokenService.createFamily(user.id);

    const tokens = await this.issueTokens(
      user.id,
      user.email,
      user.role,
      familyId,
    );

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'LOGIN',
        resourceType: 'User',
        resourceId: user.id,
        metadata: {
          role: user.role,
        },
      },
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async refresh(dto: RefreshTokenDto) {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        dto.refreshToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
          algorithms: ['HS256'],
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!payload.familyId || !payload.jti) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const nextTokens = await this.createTokenPair(
      user.id,
      user.email,
      user.role,
      payload.familyId,
    );

    const tokenResult = await this.refreshTokenService.rotateToken(
      dto.refreshToken,
      user.id,
      payload.familyId,
      nextTokens.refreshToken,
      nextTokens.refreshTokenExpiresAt,
    );

    if (tokenResult !== 'rotated') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      accessToken: nextTokens.accessToken,
      refreshToken: nextTokens.refreshToken,
    };
  }

  async logout(userId: string, dto: RefreshTokenDto): Promise<void> {
    await this.refreshTokenService.revokeToken(dto.refreshToken, userId);

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'LOGOUT',
        resourceType: 'User',
        resourceId: userId,
      },
    });
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: UserRole,
    familyId: string,
  ) {
    const tokens = await this.createTokenPair(userId, email, role, familyId);

    await this.refreshTokenService.storeToken(
      userId,
      familyId,
      tokens.refreshToken,
      tokens.refreshTokenExpiresAt,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  private async createTokenPair(
    userId: string,
    email: string,
    role: UserRole,
    familyId: string,
  ): Promise<TokenPair> {
    const payload = {
      sub: userId,
      email,
      role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    const refreshExpiresIn = this.configService.getOrThrow<string>(
      'JWT_REFRESH_EXPIRES_IN',
    );

    const refreshToken = await this.jwtService.signAsync(
      {
        ...payload,
        jti: randomUUID(),
        familyId,
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpiresIn as JwtSignOptions['expiresIn'],
        algorithm: 'HS256',
      },
    );

    const decodedRefreshToken =
      this.jwtService.decode<RefreshTokenPayload>(refreshToken);

    if (!decodedRefreshToken.exp) {
      throw new Error('Refresh token expiration could not be determined');
    }

    return {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt: new Date(decodedRefreshToken.exp * 1000),
    };
  }
}
