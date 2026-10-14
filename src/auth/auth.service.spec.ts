import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, jest } from '@jest/globals';

import { UserRole } from '../generated/prisma/enums';
import { AuthService } from './auth.service';

interface RefreshPayload {
  jti?: string;
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
      {
        getOrThrow: () => 'test-refresh-secret',
      } as never,
      { storeToken } as never,
      {} as never,
    );

    const [first, second] = await Promise.all([
      authService['issueTokens'](
        'user-123',
        'student@example.com',
        UserRole.HOLDER,
      ),
      authService['issueTokens'](
        'user-123',
        'student@example.com',
        UserRole.HOLDER,
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

    let tokenAvailable = true;

    const consumeToken = jest.fn(() => {
      const consumed = tokenAvailable;
      tokenAvailable = false;

      return Promise.resolve(consumed);
    });

    const storeToken = jest.fn(() => Promise.resolve());

    const authService = new AuthService(
      {
        findById: () => Promise.resolve(user),
      } as never,
      {} as never,
      jwtService,
      {
        getOrThrow: () => 'test-refresh-secret',
      } as never,
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
      },
      {
        secret: 'test-refresh-secret',
        expiresIn: '7d',
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
    expect(storeToken).toHaveBeenCalledTimes(1);
  });
});
