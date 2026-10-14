import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, jest } from '@jest/globals';

import { UserRole } from '../generated/prisma/enums';
import { AuthService } from './auth.service';

interface RefreshPayload {
  jti?: string;
  familyId?: string;
}

function createConfigServiceMock() {
  return {
    getOrThrow: (key: string): string => {
      const values: Record<string, string> = {
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_REFRESH_EXPIRES_IN: '7d',
      };

      const value = values[key];

      if (!value) {
        throw new Error(`Missing test configuration: ${key}`);
      }

      return value;
    },
  };
}

describe('AuthService - Refresh Token Security', () => {
  it('generates different refresh tokens for simultaneous requests', async () => {
    const jwtService = new JwtService({
      secret: 'test-access-secret',
      signOptions: { expiresIn: '15m' },
    });

    const storeToken = jest.fn(() => Promise.resolve());

    const authService = new AuthService(
      {} as never,
      {} as never,
      jwtService,
      createConfigServiceMock() as never,
      {
        storeToken,
      } as never,
      {} as never,
    );

    const familyId = 'family-123';

    const [first, second] = await Promise.all([
      authService['issueTokens'](
        'user-123',
        'student@example.com',
        UserRole.HOLDER,
        familyId,
      ),
      authService['issueTokens'](
        'user-123',
        'student@example.com',
        UserRole.HOLDER,
        familyId,
      ),
    ]);

    expect(first.refreshToken).not.toBe(second.refreshToken);

    const firstPayload = jwtService.decode<RefreshPayload>(first.refreshToken);
    const secondPayload = jwtService.decode<RefreshPayload>(
      second.refreshToken,
    );

    expect(firstPayload.jti).toBeDefined();
    expect(secondPayload.jti).toBeDefined();

    expect(firstPayload.jti).not.toBe(secondPayload.jti);

    expect(firstPayload.familyId).toBe(familyId);
    expect(secondPayload.familyId).toBe(familyId);

    expect(storeToken).toHaveBeenCalledTimes(2);
  });

  it('allows only one of two concurrent refresh attempts using the same token', async () => {
    const jwtService = new JwtService({
      secret: 'test-access-secret',
      signOptions: { expiresIn: '15m' },
    });

    const user = {
      id: 'user-123',
      email: 'student@example.com',
      role: UserRole.HOLDER,
    };

    const familyId = 'family-123';

    let tokenAvailable = true;

    const consumeToken = jest.fn<
      (
        token: string,
        userId: string,
        familyId: string,
      ) => Promise<'consumed' | 'invalid'>
    >(() => {
      const result = tokenAvailable ? 'consumed' : 'invalid';

      tokenAvailable = false;

      return Promise.resolve(result);
    });

    const storeToken = jest.fn(() => Promise.resolve());

    const authService = new AuthService(
      {
        findById: () => Promise.resolve(user),
      } as never,
      {} as never,
      jwtService,
      createConfigServiceMock() as never,
      {
        consumeToken,
        storeToken,
      } as never,
      {} as never,
    );

    const refreshToken = await jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        jti: 'original-token-id',
        familyId,
      },
      {
        secret: 'test-refresh-secret',
        expiresIn: '7d',
        algorithm: 'HS256',
      },
    );

    const attemptRefresh = async (): Promise<'success' | 'rejected'> => {
      try {
        await authService.refresh({ refreshToken });

        return 'success';
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(UnauthorizedException);

        return 'rejected';
      }
    };

    const results = await Promise.all([attemptRefresh(), attemptRefresh()]);

    expect(results.filter((result) => result === 'success')).toHaveLength(1);

    expect(results.filter((result) => result === 'rejected')).toHaveLength(1);

    expect(consumeToken).toHaveBeenCalledTimes(2);

    expect(consumeToken).toHaveBeenCalledWith(refreshToken, user.id, familyId);

    expect(storeToken).toHaveBeenCalledTimes(1);
  });

  it('rejects a refresh token that does not contain a token family', async () => {
    const jwtService = new JwtService({
      secret: 'test-access-secret',
      signOptions: { expiresIn: '15m' },
    });

    const user = {
      id: 'user-123',
      email: 'student@example.com',
      role: UserRole.HOLDER,
    };

    const consumeToken = jest.fn();

    const authService = new AuthService(
      {
        findById: () => Promise.resolve(user),
      } as never,
      {} as never,
      jwtService,
      createConfigServiceMock() as never,
      {
        consumeToken,
      } as never,
      {} as never,
    );

    const refreshToken = await jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        jti: 'token-without-family',
      },
      {
        secret: 'test-refresh-secret',
        expiresIn: '7d',
        algorithm: 'HS256',
      },
    );

    await expect(authService.refresh({ refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(consumeToken).not.toHaveBeenCalled();
  });
});
