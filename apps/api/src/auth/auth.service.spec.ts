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

  it('stores refresh token expiry based on JWT_REFRESH_EXPIRES_IN', async () => {
    const jwtService = new JwtService({
      secret: 'test-access-secret',
      signOptions: { expiresIn: '15m' },
    });

    const storeToken = jest.fn<
      (
        userId: string,
        familyId: string,
        token: string,
        expiresAt: Date,
      ) => Promise<void>
    >(() => Promise.resolve());

    const configService = {
      getOrThrow: (key: string): string => {
        const values: Record<string, string> = {
          JWT_REFRESH_SECRET: 'test-refresh-secret',
          JWT_REFRESH_EXPIRES_IN: '2h',
        };

        const value = values[key];

        if (!value) {
          throw new Error(`Missing test configuration: ${key}`);
        }

        return value;
      },
    };

    const authService = new AuthService(
      {} as never,
      {} as never,
      jwtService,
      configService as never,
      {
        storeToken,
      } as never,
      {} as never,
    );

    const result = await authService['issueTokens'](
      'user-123',
      'student@example.com',
      UserRole.HOLDER,
      'family-123',
    );

    const decoded = jwtService.decode<{ exp?: number }>(result.refreshToken);

    if (!decoded.exp) {
      throw new Error('Expected refresh token exp claim');
    }

    expect(storeToken).toHaveBeenCalledTimes(1);

    const storedCall = storeToken.mock.calls[0];

    if (!storedCall) {
      throw new Error('Expected refresh token to be stored');
    }

    const storedExpiresAt = storedCall[3];

    expect(storedExpiresAt.getTime()).toBe(decoded.exp * 1000);
  });

  it('uses atomic token rotation for refresh requests', async () => {
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

    const rotateToken = jest.fn<
      (
        currentToken: string,
        userId: string,
        familyId: string,
        nextToken: string,
        nextExpiresAt: Date,
      ) => Promise<'rotated'>
    >(() => Promise.resolve('rotated'));

    const authService = new AuthService(
      {
        findById: () => Promise.resolve(user),
      } as never,
      {} as never,
      jwtService,
      createConfigServiceMock() as never,
      {
        rotateToken,
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

    const result = await authService.refresh({ refreshToken });

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.refreshToken).not.toBe(refreshToken);

    expect(rotateToken).toHaveBeenCalledTimes(1);

    const rotationCall = rotateToken.mock.calls[0];

    if (!rotationCall) {
      throw new Error('Expected refresh token rotation');
    }

    expect(rotationCall[0]).toBe(refreshToken);
    expect(rotationCall[1]).toBe(user.id);
    expect(rotationCall[2]).toBe(familyId);
    expect(rotationCall[3]).toBe(result.refreshToken);
    expect(rotationCall[4]).toBeInstanceOf(Date);
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

    const rotateToken = jest.fn<
      (
        currentToken: string,
        userId: string,
        familyId: string,
        nextToken: string,
        nextExpiresAt: Date,
      ) => Promise<'rotated' | 'reused'>
    >(() => {
      const result = tokenAvailable ? 'rotated' : 'reused';

      tokenAvailable = false;

      return Promise.resolve(result);
    });

    const authService = new AuthService(
      {
        findById: () => Promise.resolve(user),
      } as never,
      {} as never,
      jwtService,
      createConfigServiceMock() as never,
      {
        rotateToken,
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
    expect(rotateToken).toHaveBeenCalledTimes(2);
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

    const rotateToken = jest.fn();

    const authService = new AuthService(
      {
        findById: () => Promise.resolve(user),
      } as never,
      {} as never,
      jwtService,
      createConfigServiceMock() as never,
      {
        rotateToken,
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

    expect(rotateToken).not.toHaveBeenCalled();
  });
});
