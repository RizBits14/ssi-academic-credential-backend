import { describe, expect, it } from '@jest/globals';
import { HashingService } from './hashing.service';

describe('HashingService', () => {
  const hashingService = new HashingService();

  it('should generate the same SHA-256 hash for identical input', () => {
    const first = hashingService.sha256('academic-credential');
    const second = hashingService.sha256('academic-credential');

    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it('should generate different hashes for different input', () => {
    const first = hashingService.sha256('credential-one');
    const second = hashingService.sha256('credential-two');

    expect(first).not.toBe(second);
  });
});
