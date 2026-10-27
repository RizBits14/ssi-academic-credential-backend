import { describe, expect, it } from '@jest/globals';

import { canonicalizeJson } from './json-canonicalization.util';

describe('canonicalizeJson', () => {
  it('should canonicalize object properties deterministically', () => {
    const value = {
      z: 1,
      a: {
        d: 4,
        b: 2,
      },
      c: [
        {
          y: 2,
          x: 1,
        },
      ],
    };

    expect(canonicalizeJson(value)).toBe(
      '{"a":{"b":2,"d":4},"c":[{"x":1,"y":2}],"z":1}',
    );
  });

  it('should use RFC 8785 number serialization', () => {
    const value = {
      numbers: [333333333.3333333, 1e30, 4.5, 2e-3, 1e-27],
    };

    expect(canonicalizeJson(value)).toBe(
      '{"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27]}',
    );
  });

  it('should preserve array order while canonicalizing array objects', () => {
    const value = [
      {
        z: 2,
        a: 1,
      },
      {
        d: 4,
        b: 3,
      },
    ];

    expect(canonicalizeJson(value)).toBe('[{"a":1,"z":2},{"b":3,"d":4}]');
  });

  it('should reject values that cannot be represented as JSON', () => {
    expect(() => canonicalizeJson(undefined)).toThrow(
      'Value cannot be canonicalized as JSON',
    );
  });
});
