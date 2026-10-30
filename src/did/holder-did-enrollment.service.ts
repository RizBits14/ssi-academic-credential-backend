import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import {
  DidKeyStatus,
  DidOwnerType,
  DidStatus,
  UserRole,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { HolderKeyProofService } from './holder-key-proof.service';

@Injectable()
export class HolderDidEnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keyProof: HolderKeyProofService,
  ) {}

  async begin(holderId: string, publicKeyPem: string) {
    await this.assertEligibleHolder(holderId);
    return this.keyProof.begin({ holderId, publicKeyPem });
  }

  async complete(holderId: string, challengeId: string, signature: string) {
    await this.assertEligibleHolder(holderId);

    // The proof service checks the authenticated holder, signature, expiry,
    // and single-use Redis challenge before returning the public key.
    const { publicKeyPem } = await this.keyProof.verifyAndConsume({
      holderId,
      challengeId,
      signature,
    });

    const did = `did:mock:holder:${randomUUID()}`;
    const fingerprint = createHash('sha256')
      .update(publicKeyPem, 'utf8')
      .digest('hex');

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const record = await transaction.did.create({
          data: {
            did,
            ownerType: DidOwnerType.USER,
            ownerId: holderId,
            currentKeyVersion: 1,
            status: DidStatus.ACTIVE,
          },
          select: {
            id: true,
            did: true,
            ownerType: true,
            ownerId: true,
            currentKeyVersion: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        await transaction.didKey.create({
          data: {
            didId: record.id,
            version: 1,
            publicKey: publicKeyPem,
            encryptedPrivateKey: null,
            iv: null,
            authTag: null,
            encryptionKeyId: null,
            algorithm: 'Ed25519',
            status: DidKeyStatus.ACTIVE,
          },
        });

        await transaction.auditLog.create({
          data: {
            actorId: holderId,
            action: 'DID_CREATED',
            resourceType: 'DID',
            resourceId: record.id,
            metadata: {
              did,
              ownerType: DidOwnerType.USER,
              ownerId: holderId,
              keyVersion: 1,
              keyCustody: 'CLIENT',
              publicKeySha256: fingerprint,
            },
          },
        });

        return record;
      });
    } catch (error: unknown) {
      // Unique(ownerType, ownerId) prevents concurrent enrollments from
      // creating multiple DIDs for one holder.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Holder already has a DID');
      }
      throw error;
    }
  }

  private async assertEligibleHolder(holderId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: holderId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== UserRole.HOLDER) {
      throw new ConflictException('Only holders can enroll user DIDs');
    }

    const existing = await this.prisma.did.findUnique({
      where: {
        ownerType_ownerId: {
          ownerType: DidOwnerType.USER,
          ownerId: holderId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Holder already has a DID');
    }
  }
}
