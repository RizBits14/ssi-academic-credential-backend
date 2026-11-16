import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const mockPrisma = {
    user: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      count: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    auditLog: {
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  let usersService: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();

    usersService = new UsersService(mockPrisma as unknown as PrismaService);
  });

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

  it('should list users with pagination, search and role filters', async () => {
    const users = [
      {
        id: 'user-id',
        name: 'Test Holder',
        email: 'holder@example.com',
        role: UserRole.HOLDER,
      },
    ];

    mockPrisma.user.findMany.mockResolvedValue(users);
    mockPrisma.user.count.mockResolvedValue(1);

    const result = await usersService.findAllPaginated({
      page: 2,
      limit: 10,
      search: 'holder',
      role: UserRole.HOLDER,
    });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          role: UserRole.HOLDER,
          OR: [
            {
              name: {
                contains: 'holder',
                mode: 'insensitive',
              },
            },
            {
              email: {
                contains: 'holder',
                mode: 'insensitive',
              },
            },
          ],
        },
        skip: 10,
        take: 10,
      }),
    );

    expect(mockPrisma.user.count).toHaveBeenCalledWith({
      where: {
        role: UserRole.HOLDER,
        OR: [
          {
            name: {
              contains: 'holder',
              mode: 'insensitive',
            },
          },
          {
            email: {
              contains: 'holder',
              mode: 'insensitive',
            },
          },
        ],
      },
    });

    expect(result).toEqual({
      data: users,
      meta: {
        page: 2,
        limit: 10,
        total: 1,
        totalPages: 1,
      },
    });
  });

  it('should return user details with organization memberships and recent activities', async () => {
    const user = {
      id: 'user-id',
      name: 'Test Holder',
      email: 'holder@example.com',
      role: UserRole.HOLDER,
      organizationMemberships: [],
      _count: {
        organizationMemberships: 0,
        academicRecords: 1,
        credentials: 1,
      },
    };

    const recentActivities = [
      {
        id: 'activity-id',
        action: 'LOGIN',
        resourceType: 'User',
        resourceId: 'user-id',
        organizationId: null,
        createdAt: new Date('2026-11-16T10:00:00.000Z'),
      },
    ];

    mockPrisma.user.findUnique.mockResolvedValue(user);
    mockPrisma.auditLog.findMany.mockResolvedValue(recentActivities);

    const result = await usersService.findAdminDetailsById('user-id');

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'user-id',
        },
        select: expect.objectContaining({
          id: true,
          name: true,
          email: true,
          role: true,
          organizationMemberships: expect.any(Object),
        }),
      }),
    );

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        actorId: 'user-id',
      },
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        organizationId: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 10,
    });

    expect(result).toEqual({
      ...user,
      recentActivities,
    });
  });

  it('should throw NotFoundException when the requested user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      usersService.findAdminDetailsById('nonexistent-user-id'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(mockPrisma.auditLog.findMany).not.toHaveBeenCalled();
  });
});
