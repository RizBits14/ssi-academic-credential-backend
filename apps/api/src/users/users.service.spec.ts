import { describe, expect, it, jest } from '@jest/globals';
import { UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const mockPrisma = {
    user: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const usersService = new UsersService(mockPrisma as unknown as PrismaService);

  it('should create a user', async () => {
    const input = {
      name: 'Test Holder',
      email: 'holder@example.com',
      passwordHash: 'hashed-password',
      role: UserRole.HOLDER,
    };

    mockPrisma.user.create.mockResolvedValue(input);

    const result = await usersService.createUser(input);

    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: input,
    });

    expect(result).toEqual(input);
  });

  it('should find a user by email', async () => {
    const user = {
      id: 'user-id',
      email: 'holder@example.com',
    };

    mockPrisma.user.findUnique.mockResolvedValue(user);

    const result = await usersService.findByEmail(user.email);

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: user.email },
    });

    expect(result).toEqual(user);
  });
});
