import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

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

    const tokens = await this.issueTokens(user.id, user.email, user.role);

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
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenConsumed = await this.refreshTokenService.consumeToken(
      dto.refreshToken,
      user.id,
    );

    if (!tokenConsumed) {
      throw new UnauthorizedException(
        'Refresh token has expired or already been used',
      );
    }

    return this.issueTokens(user.id, user.email, user.role);
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

  private async issueTokens(userId: string, email: string, role: UserRole) {
    const payload = {
      sub: userId,
      email,
      role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });

    const refreshTokenExpiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    );

    await this.refreshTokenService.storeToken(
      userId,
      refreshToken,
      refreshTokenExpiresAt,
    );

    return {
      accessToken,
      refreshToken,
    };
  }
}
