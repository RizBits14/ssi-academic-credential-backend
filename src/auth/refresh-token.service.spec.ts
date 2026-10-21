import { describe, expect, it, jest } from '@jest/globals';

import { RefreshTokenService } from './refresh-token.service';

describe('RefreshTokenService - Token Family Security', () => {
  function createTransactionalService(options?: {
    familyLockCount?: number;
    consumeCount?: number;
    existingToken?: {
      userId: string;
      familyId: string;
      expiresAt: Date;
      revokedAt: Date | null;
    } | null;
  }) {
    const refreshTokenFamilyUpdateMany = jest
      .fn<(input: unknown) => Promise<{ count: number }>>()
      .mockResolvedValue({
        count: options?.familyLockCount ?? 1,
      });

    const refreshTokenUpdateMany = jest
      .fn<(input: unknown) => Promise<{ count: number }>>()
      .mockResolvedValue({
        count: options?.consumeCount ?? 1,
      });

    const refreshTokenCreate = jest.fn<
      (input: {
        data: {
          userId: string;
          familyId: string;
          tokenHash: string;
          expiresAt: Date;
        };
      }) => Promise<{ id: string }>
    >(() =>
      Promise.resolve({
        id: 'new-token-id',
      }),
    );

    const refreshTokenFindUnique = jest.fn(() =>
      Promise.resolve(options?.existingToken ?? null),
    );

    const transactionClient = {
      refreshTokenFamily: {
        updateMany: refreshTokenFamilyUpdateMany,
      },
      refreshToken: {
        updateMany: refreshTokenUpdateMany,
        create: refreshTokenCreate,
        findUnique: refreshTokenFindUnique,
      },
    };

    const transaction = jest.fn(
      async (
        callback: (transaction: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    );

    const service = new RefreshTokenService({
      $transaction: transaction,
    } as never);

    return {
      service,
      transaction,
      refreshTokenFamilyUpdateMany,
      refreshTokenUpdateMany,
      refreshTokenCreate,
      refreshTokenFindUnique,
    };
  }

  it('rotates an active refresh token and stores its child atomically', async () => {
    const mocks = createTransactionalService();

    const nextExpiresAt = new Date(Date.now() + 60_000);

    const result = await mocks.service.rotateToken(
      'current-token',
      'user-123',
      'family-123',
      'next-token',
      nextExpiresAt,
    );

    expect(result).toBe('rotated');
    expect(mocks.transaction).toHaveBeenCalledTimes(1);

    expect(mocks.refreshTokenFamilyUpdateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'family-123',
        userId: 'user-123',
        revokedAt: null,
      },
      data: {
        revokedAt: null,
      },
    });

    expect(mocks.refreshTokenUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.refreshTokenCreate).toHaveBeenCalledTimes(1);

    const createdTokenCall = mocks.refreshTokenCreate.mock.calls[0];

    if (!createdTokenCall) {
      throw new Error('Expected child refresh token to be stored');
    }

    const [createdTokenInput] = createdTokenCall;

    expect(createdTokenInput.data.userId).toBe('user-123');
    expect(createdTokenInput.data.familyId).toBe('family-123');
    expect(createdTokenInput.data.tokenHash).not.toBe('next-token');
    expect(createdTokenInput.data.expiresAt).toBe(nextExpiresAt);
  });

  it('does not store a child token when the family is already revoked', async () => {
    const mocks = createTransactionalService({
      familyLockCount: 0,
    });

    const result = await mocks.service.rotateToken(
      'current-token',
      'user-123',
      'family-123',
      'next-token',
      new Date(Date.now() + 60_000),
    );

    expect(result).toBe('invalid');
    expect(mocks.refreshTokenUpdateMany).not.toHaveBeenCalled();
    expect(mocks.refreshTokenFindUnique).not.toHaveBeenCalled();
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();
  });

  it('detects reuse and revokes the family and its stored child tokens', async () => {
    const revokedAt = new Date();

    const mocks = createTransactionalService({
      consumeCount: 0,
      existingToken: {
        userId: 'user-123',
        familyId: 'family-123',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt,
      },
    });

    mocks.refreshTokenFamilyUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    mocks.refreshTokenUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await mocks.service.rotateToken(
      'reused-token',
      'user-123',
      'family-123',
      'candidate-child-token',
      new Date(Date.now() + 60_000),
    );

    expect(result).toBe('reused');

    expect(mocks.refreshTokenFamilyUpdateMany).toHaveBeenCalledTimes(2);
    expect(mocks.refreshTokenUpdateMany).toHaveBeenCalledTimes(2);
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();

    expect(mocks.refreshTokenFamilyUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'family-123',
        userId: 'user-123',
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });

    expect(mocks.refreshTokenUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        familyId: 'family-123',
        userId: 'user-123',
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });
  });

  it('returns invalid when the current token does not exist', async () => {
    const mocks = createTransactionalService({
      consumeCount: 0,
      existingToken: null,
    });

    const result = await mocks.service.rotateToken(
      'unknown-token',
      'user-123',
      'family-123',
      'next-token',
      new Date(Date.now() + 60_000),
    );

    expect(result).toBe('invalid');
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();
  });

  it('returns invalid when the current token belongs to another user', async () => {
    const mocks = createTransactionalService({
      consumeCount: 0,
      existingToken: {
        userId: 'different-user',
        familyId: 'family-123',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
      },
    });

    const result = await mocks.service.rotateToken(
      'current-token',
      'user-123',
      'family-123',
      'next-token',
      new Date(Date.now() + 60_000),
    );

    expect(result).toBe('invalid');
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();
  });

  it('returns invalid when the current token belongs to another family', async () => {
    const mocks = createTransactionalService({
      consumeCount: 0,
      existingToken: {
        userId: 'user-123',
        familyId: 'different-family',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
      },
    });

    const result = await mocks.service.rotateToken(
      'current-token',
      'user-123',
      'family-123',
      'next-token',
      new Date(Date.now() + 60_000),
    );

    expect(result).toBe('invalid');
  });

  it('returns invalid when the current token has expired', async () => {
    const mocks = createTransactionalService({
      consumeCount: 0,
      existingToken: {
        userId: 'user-123',
        familyId: 'family-123',
        expiresAt: new Date(Date.now() - 60_000),
        revokedAt: new Date(),
      },
    });

    const result = await mocks.service.rotateToken(
      'expired-token',
      'user-123',
      'family-123',
      'next-token',
      new Date(Date.now() + 60_000),
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

    const transaction = jest.fn();

    const service = new RefreshTokenService({
      refreshToken: {
        findUnique: refreshTokenFindUnique,
      },
      $transaction: transaction,
    } as never);

    await service.revokeToken('refresh-token', 'user-123');

    expect(refreshTokenFindUnique).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('revokes the active family before revoking its active tokens', async () => {
    const refreshTokenFindUnique = jest.fn(() =>
      Promise.resolve({
        userId: 'user-123',
        familyId: 'family-123',
      }),
    );

    const callOrder: string[] = [];

    const transactionClient = {
      refreshTokenFamily: {
        updateMany: jest.fn(() => {
          callOrder.push('family');
          return Promise.resolve({ count: 1 });
        }),
      },
      refreshToken: {
        updateMany: jest.fn(() => {
          callOrder.push('tokens');
          return Promise.resolve({ count: 1 });
        }),
      },
    };

    const transaction = jest.fn(
      async (
        callback: (transaction: typeof transactionClient) => Promise<void>,
      ) => callback(transactionClient),
    );

    const service = new RefreshTokenService({
      refreshToken: {
        findUnique: refreshTokenFindUnique,
      },
      $transaction: transaction,
    } as never);

    await service.revokeToken('refresh-token', 'user-123');

    expect(callOrder).toEqual(['family', 'tokens']);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
