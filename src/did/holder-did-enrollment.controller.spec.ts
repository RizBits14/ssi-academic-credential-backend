import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../generated/prisma/enums';
import { HolderDidEnrollmentController } from './holder-did-enrollment.controller';
import { HolderDidEnrollmentService } from './holder-did-enrollment.service';

describe('HolderDidEnrollmentController', () => {
  const enrollment = {
    begin: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    complete: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };
  let controller: HolderDidEnrollmentController;
  const request = {
    user: {
      sub: 'authenticated-holder-id',
      role: UserRole.HOLDER,
    },
  } as AuthenticatedRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new HolderDidEnrollmentController(
      enrollment as unknown as HolderDidEnrollmentService,
    );
  });

  it('starts enrollment for the authenticated holder', async () => {
    enrollment.begin.mockResolvedValue({ challengeId: 'abc' });
    await controller.begin(request, { publicKeyPem: 'PUBLIC_KEY' });
    expect(enrollment.begin).toHaveBeenCalledWith(
      'authenticated-holder-id',
      'PUBLIC_KEY',
    );
  });

  it('completes enrollment for the authenticated holder', async () => {
    enrollment.complete.mockResolvedValue({ did: 'did:mock:holder:123' });
    await controller.complete(request, {
      challengeId: 'challenge-id',
      signature: 'signature',
    });
    expect(enrollment.complete).toHaveBeenCalledWith(
      'authenticated-holder-id',
      'challenge-id',
      'signature',
    );
  });
});
