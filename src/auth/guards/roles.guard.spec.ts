import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../generated/prisma/enums';
import { RolesGuard } from './roles.guard';

function createContext(role: UserRole): ExecutionContext {
  return {
    getHandler: () => function testHandler() {},
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({
        user: {
          sub: 'user-id',
          email: 'user@example.com',
          role,
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('should allow a user with the required role', () => {
    const reflector = {
      getAllAndOverride: () => [UserRole.HOLDER],
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createContext(UserRole.HOLDER))).toBe(true);
  });

  it('should reject a user without the required role', () => {
    const reflector = {
      getAllAndOverride: () => [UserRole.ISSUER_ADMIN],
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(createContext(UserRole.HOLDER))).toThrow(
      ForbiddenException,
    );
  });

  it('should allow access when no roles are required', () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createContext(UserRole.HOLDER))).toBe(true);
  });
});
