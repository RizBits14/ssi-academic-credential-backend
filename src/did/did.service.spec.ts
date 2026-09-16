import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { EncryptionService } from '../crypto/encryption.service';
import { SignatureService } from '../crypto/signature.service';
import {
  DidOwnerType,
  DidStatus,
  OrganizationType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { DidService } from './did.service';

describe('DidService', () => {
  const transactionClient = {
    did: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    auditLog: {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const mockPrisma = {
    organization: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    user: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    did: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),

      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },

    $transaction: jest.fn(
      async (
        callback: (transaction: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    ),
  };

  const mockEncryptionService = {
    encrypt: jest.fn(() => ({
      ciphertext: 'encrypted-private-key',
      iv: 'test-iv',
      authTag: 'test-auth-tag',
    })),

    decrypt: jest.fn(() => 'PRIVATE_KEY'),
  };

  const mockSignatureService = {
    generateKeyPair: jest.fn(() => ({
      publicKey: 'PUBLIC_KEY',
      privateKey: 'PRIVATE_KEY',
    })),

    sign: jest.fn(() => 'signature'),
  };

  let service: DidService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new DidService(
      mockPrisma as unknown as PrismaService,
      mockEncryptionService as unknown as EncryptionService,
      mockSignatureService as unknown as SignatureService,
    );
  });

  it('should create a university DID and audit the creation', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      type: OrganizationType.UNIVERSITY,
    });

    mockPrisma.did.findFirst.mockResolvedValue(null);

    transactionClient.did.create.mockImplementation((...args: unknown[]) => {
      const [input] = args as [
        {
          data: Record<string, unknown>;
        },
      ];

      return Promise.resolve({
        id: 'did-record-id',
        ...input.data,
      });
    });

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = (await service.createForOrganization('university-id')) as {
      id: string;
      did: string;
      ownerType: DidOwnerType;
      encryptedPrivateKey: string;
    };

    expect(result.did).toMatch(/^did:mock:university:/);

    expect(result.ownerType).toBe(DidOwnerType.ORGANIZATION);

    expect(result.encryptedPrivateKey).toBe('encrypted-private-key');

    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'university-id',
        action: 'DID_CREATED',
        resourceType: 'DID',
        resourceId: 'did-record-id',

        metadata: {
          did: result.did,
          ownerType: DidOwnerType.ORGANIZATION,
          ownerId: 'university-id',
        },
      },
    });
  });

  it('should create a holder DID and audit the creation', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'holder-id',
    });

    mockPrisma.did.findFirst.mockResolvedValue(null);

    transactionClient.did.create.mockImplementation((...args: unknown[]) => {
      const [input] = args as [
        {
          data: Record<string, unknown>;
        },
      ];

      return Promise.resolve({
        id: 'holder-did-record-id',
        ...input.data,
      });
    });

    transactionClient.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = (await service.createForUser('holder-id')) as {
      did: string;
    };

    expect(result.did).toMatch(/^did:mock:holder:/);

    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'holder-id',
        action: 'DID_CREATED',
        resourceType: 'DID',
        resourceId: 'holder-did-record-id',

        metadata: {
          did: result.did,
          ownerType: DidOwnerType.USER,
          ownerId: 'holder-id',
        },
      },
    });
  });

  it('should reject creating a second DID for the same organization', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      type: OrganizationType.UNIVERSITY,
    });

    mockPrisma.did.findFirst.mockResolvedValue({
      id: 'existing-did-id',
      status: DidStatus.ACTIVE,
    });

    await expect(
      service.createForOrganization('university-id'),
    ).rejects.toThrow('Organization already has a DID');
  });
});
