import canonicalize from 'canonicalize';

export function canonicalizeJson(value: unknown): string {
  const result = canonicalize(value);

  if (result === undefined) {
    throw new TypeError('Value cannot be canonicalized as JSON');
  }

  return result;
}
