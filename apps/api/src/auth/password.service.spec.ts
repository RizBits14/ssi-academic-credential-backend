import { describe, expect, it } from '@jest/globals';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const passwordService = new PasswordService();

  it('should hash and verify a password', async () => {
    const password = 'StrongPassword123!';

    const hash = await passwordService.hash(password);

    expect(hash).not.toBe(password);
    expect(await passwordService.verify(hash, password)).toBe(true);
    expect(await passwordService.verify(hash, 'WrongPassword')).toBe(false);
  });
});
