import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../generated/prisma/enums';
import { AuthService } from './auth.service';
import { describe, expect, it, jest } from '@jest/globals';

interface RefreshPayload {
  jti?: string;
}

describe('AuthService - Refresh Token Uniqueness', () => {
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
});
