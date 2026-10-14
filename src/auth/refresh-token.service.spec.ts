import { describe, expect, it, jest } from '@jest/globals';

import { RefreshTokenService } from './refresh-token.service';

describe('RefreshTokenService - Token Family Security', () => {
  it('returns consumed when an active refresh token is successfully consumed', async () => {
    const refreshTokenUpdateMany = jest.fn(() => Promise.resolve({ count: 1 }));

    const refreshTokenFindUnique = jest.fn();

    const service = new RefreshTokenService({
      refreshToken: {
        updateMany: refreshTokenUpdateMany,
        findUnique: refreshTokenFindUnique,
      },
    } as never);

    const result = await service.consumeToken(
      'refresh-token',
      'user-123',
      'family-123',
    );

    expect(result).toBe('consumed');

    expect(refreshTokenUpdateMany).toHaveBeenCalledTimes(1);
    expect(refreshTokenFindUnique).not.toHaveBeenCalled();
  });

  it('detects reuse of an already consumed token and revokes its entire family', async () => {
    const revokedAt = new Date();

    const refreshTokenUpdateMany = jest
      .fn<() => Promise<{ count: number }>>()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const refreshTokenFindUnique = jest.fn(() =>
      Promise.resolve({
        userId: 'user-123',
        familyId: 'family-123',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt,
        family: {
          revokedAt: null,
        },
      }),
    );

    const refreshTokenFamilyUpdateMany = jest.fn(() =>
      Promise.resolve({ count: 1 }),
    );

    const transaction = jest.fn(() => Promise.resolve([]));

    const service = new RefreshTokenService({
      refreshToken: {
        updateMany: refreshTokenUpdateMany,
        findUnique: refreshTokenFindUnique,
      },
      refreshTokenFamily: {
        updateMany: refreshTokenFamilyUpdateMany,
      },
      $transaction: transaction,
    } as never);

    const result = await service.consumeToken(
      'reused-refresh-token',
      'user-123',
      'family-123',
    );

    expect(result).toBe('reused');

    expect(refreshTokenFindUnique).toHaveBeenCalledTimes(1);
    expect(refreshTokenFamilyUpdateMany).toHaveBeenCalledTimes(1);

    expect(refreshTokenUpdateMany).toHaveBeenCalledTimes(2);

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('returns invalid when the refresh token does not exist', async () => {
    const refreshTokenUpdateMany = jest.fn(() => Promise.resolve({ count: 0 }));

    const refreshTokenFindUnique = jest.fn(() => Promise.resolve(null));

    const service = new RefreshTokenService({
      refreshToken: {
        updateMany: refreshTokenUpdateMany,
        findUnique: refreshTokenFindUnique,
      },
    } as never);

    const result = await service.consumeToken(
      'unknown-token',
      'user-123',
      'family-123',
    );

    expect(result).toBe('invalid');
  });

  it('returns invalid when the stored token belongs to another user', async () => {
    const refreshTokenUpdateMany = jest.fn(() => Promise.resolve({ count: 0 }));

    const refreshTokenFindUnique = jest.fn(() =>
      Promise.resolve({
        userId: 'different-user',
        familyId: 'family-123',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        family: {
          revokedAt: null,
        },
      }),
    );

    const service = new RefreshTokenService({
      refreshToken: {
        updateMany: refreshTokenUpdateMany,
        findUnique: refreshTokenFindUnique,
      },
    } as never);

    const result = await service.consumeToken(
      'refresh-token',
      'user-123',
      'family-123',
    );

    expect(result).toBe('invalid');
  });

  it('returns invalid when the token belongs to another family', async () => {
    const refreshTokenUpdateMany = jest.fn(() => Promise.resolve({ count: 0 }));

    const refreshTokenFindUnique = jest.fn(() =>
      Promise.resolve({
        userId: 'user-123',
        familyId: 'different-family',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        family: {
          revokedAt: null,
        },
      }),
    );

    const service = new RefreshTokenService({
      refreshToken: {
        updateMany: refreshTokenUpdateMany,
        findUnique: refreshTokenFindUnique,
      },
    } as never);

    const result = await service.consumeToken(
      'refresh-token',
      'user-123',
      'family-123',
    );

    expect(result).toBe('invalid');
  });

  it('returns invalid when the refresh token has expired', async () => {
    const refreshTokenUpdateMany = jest.fn(() => Promise.resolve({ count: 0 }));

    const refreshTokenFindUnique = jest.fn(() =>
      Promise.resolve({
        userId: 'user-123',
        familyId: 'family-123',
        expiresAt: new Date(Date.now() - 60_000),
        revokedAt: null,
        family: {
          revokedAt: null,
        },
      }),
    );

    const service = new RefreshTokenService({
      refreshToken: {
        updateMany: refreshTokenUpdateMany,
        findUnique: refreshTokenFindUnique,
      },
    } as never);

    const result = await service.consumeToken(
      'expired-token',
      'user-123',
      'family-123',
    );

    expect(result).toBe('invalid');
  });

  it('returns invalid when the token family has already been revoked', async () => {
    const refreshTokenUpdateMany = jest.fn(() => Promise.resolve({ count: 0 }));

    const refreshTokenFindUnique = jest.fn(() =>
      Promise.resolve({
        userId: 'user-123',
        familyId: 'family-123',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        family: {
          revokedAt: new Date(),
        },
      }),
    );

    const service = new RefreshTokenService({
      refreshToken: {
        updateMany: refreshTokenUpdateMany,
        findUnique: refreshTokenFindUnique,
      },
    } as never);

    const result = await service.consumeToken(
      'refresh-token',
      'user-123',
      'family-123',
    );

    expect(result).toBe('invalid');
  });

  it('does not revoke a token family when logout receives another users token', async () => {
    const refreshTokenFindUnique = jest.fn(() =>
      Promise.resolve({
        userId: 'different-user',
        familyId: 'family-123',
      }),
    );

    const refreshTokenFamilyUpdateMany = jest.fn();
    const transaction = jest.fn();

    const service = new RefreshTokenService({
      refreshToken: {
        findUnique: refreshTokenFindUnique,
      },
      refreshTokenFamily: {
        updateMany: refreshTokenFamilyUpdateMany,
      },
      $transaction: transaction,
    } as never);

    await service.revokeToken('refresh-token', 'user-123');

    expect(refreshTokenFindUnique).toHaveBeenCalledTimes(1);
    expect(refreshTokenFamilyUpdateMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('revokes the entire family when logout receives a valid owned token', async () => {
    const refreshTokenFindUnique = jest.fn(() =>
      Promise.resolve({
        userId: 'user-123',
        familyId: 'family-123',
      }),
    );

    const refreshTokenFamilyUpdateMany = jest.fn(() =>
      Promise.resolve({ count: 1 }),
    );

    const refreshTokenUpdateMany = jest.fn(() => Promise.resolve({ count: 1 }));

    const transaction = jest.fn(() => Promise.resolve([]));

    const service = new RefreshTokenService({
      refreshToken: {
        findUnique: refreshTokenFindUnique,
        updateMany: refreshTokenUpdateMany,
      },
      refreshTokenFamily: {
        updateMany: refreshTokenFamilyUpdateMany,
      },
      $transaction: transaction,
    } as never);

    await service.revokeToken('refresh-token', 'user-123');

    expect(refreshTokenFamilyUpdateMany).toHaveBeenCalledTimes(1);
    expect(refreshTokenUpdateMany).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
