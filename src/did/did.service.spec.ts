import { describe, expect, it, jest } from '@jest/globals';
import { EncryptionService } from '../crypto/encryption.service';
import { SignatureService } from '../crypto/signature.service';
import { DidOwnerType, OrganizationType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { DidService } from './did.service';

describe('DidService', () => {
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
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  const mockEncryptionService = {
    encrypt: jest.fn(() => ({
      ciphertext: 'encrypted-private-key',
      iv: 'test-iv',
      authTag: 'test-auth-tag',
    })),
  };

  const mockSignatureService = {
    generateKeyPair: jest.fn(() => ({
      publicKey: 'PUBLIC_KEY',
      privateKey: 'PRIVATE_KEY',
    })),
  };

  const service = new DidService(
    mockPrisma as unknown as PrismaService,
    mockEncryptionService as unknown as EncryptionService,
    mockSignatureService as unknown as SignatureService,
  );

  it('should create a university DID', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'university-id',
      type: OrganizationType.UNIVERSITY,
    });

    mockPrisma.did.findFirst.mockResolvedValue(null);

    mockPrisma.did.create.mockImplementation((...args: unknown[]) => {
      const [input] = args as [
        {
          data: Record<string, unknown>;
        },
      ];

      return Promise.resolve(input.data);
    });

    const result = (await service.createForOrganization('university-id')) as {
      did: string;
      ownerType: DidOwnerType;
      encryptedPrivateKey: string;
    };

    expect(result.did).toMatch(/^did:mock:university:/);

    expect(result.ownerType).toBe(DidOwnerType.ORGANIZATION);

    expect(result.encryptedPrivateKey).toBe('encrypted-private-key');
  });
});
