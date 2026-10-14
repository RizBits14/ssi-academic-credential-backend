import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';

import { UserRole } from '../../generated/prisma/enums';
import { AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard';

function createContext(
  request: Partial<AuthenticatedRequest>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it('uses the current database role instead of the role stored in the token', async () => {
    const request = {
      headers: {
        authorization: 'Bearer valid-token',
      },
    } as AuthenticatedRequest;

    const verifyAsync = jest.fn(() =>
      Promise.resolve({
        sub: 'user-123',
        email: 'old@example.com',
        role: UserRole.ISSUER_ADMIN,
      }),
    );

    const findById = jest.fn<
      (id: string) => Promise<{
        id: string;
        email: string;
        role: UserRole;
      }>
    >(() =>
      Promise.resolve({
        id: 'user-123',
        email: 'current@example.com',
        role: UserRole.HOLDER,
      }),
    );

    const guard = new JwtAuthGuard(
      {
        verifyAsync,
      } as never,
      {
        findById,
      } as never,
    );

    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);

    expect(request.user).toEqual({
      sub: 'user-123',
      email: 'current@example.com',
      role: UserRole.HOLDER,
    });

    expect(findById).toHaveBeenCalledWith('user-123');
  });

  it('rejects a request without an access token', async () => {
    const request = {
      headers: {},
    } as AuthenticatedRequest;

    const guard = new JwtAuthGuard({} as never, {} as never);

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid access token', async () => {
    const request = {
      headers: {
        authorization: 'Bearer invalid-token',
      },
    } as AuthenticatedRequest;

    const verifyAsync = jest.fn(() =>
      Promise.reject(new Error('Invalid token')),
    );

    const guard = new JwtAuthGuard(
      {
        verifyAsync,
      } as never,
      {} as never,
    );

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a valid token when the user no longer exists', async () => {
    const request = {
      headers: {
        authorization: 'Bearer valid-token',
      },
    } as AuthenticatedRequest;

    const verifyAsync = jest.fn(() =>
      Promise.resolve({
        sub: 'deleted-user',
        email: 'deleted@example.com',
        role: UserRole.HOLDER,
      }),
    );

    const findById = jest.fn(() => Promise.resolve(null));

    const guard = new JwtAuthGuard(
      {
        verifyAsync,
      } as never,
      {
        findById,
      } as never,
    );

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a malformed bearer authorization header', async () => {
    const request = {
      headers: {
        authorization: 'Basic abc123',
      },
    } as AuthenticatedRequest;

    const guard = new JwtAuthGuard({} as never, {} as never);

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
