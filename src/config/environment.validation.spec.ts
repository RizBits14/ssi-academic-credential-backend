import { describe, expect, it } from '@jest/globals';

import { validateEnvironment } from './environment.validation';

const ACCESS_SECRET = 'a'.repeat(48);
const REFRESH_SECRET = 'b'.repeat(48);
const MASTER_KEY = '11'.repeat(32);
const DID_KEY = '22'.repeat(32);
const WALLET_KEY = '33'.repeat(32);

function validConfig(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    NODE_ENV: 'development',
    PORT: '3000',
    DATABASE_URL:
      'postgresql://user:password@db.example.com:5432/postgres?sslmode=verify-full',
    JWT_ACCESS_SECRET: ACCESS_SECRET,
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_SECRET: REFRESH_SECRET,
    JWT_REFRESH_EXPIRES_IN: '7d',
    MASTER_ENCRYPTION_KEY: MASTER_KEY,
    REDIS_URL: 'redis://localhost:6379',
    CORS_ORIGIN: 'http://localhost:3001,http://localhost:3002',
    SWAGGER_ENABLED: 'true',
    DID_ENCRYPTION_ACTIVE_KEY_ID: 'v1',
    DID_ENCRYPTION_KEY_V1: DID_KEY,
    WALLET_ENCRYPTION_ACTIVE_KEY_ID: 'v1',
    WALLET_ENCRYPTION_KEY_V1: WALLET_KEY,
    ...overrides,
  };
}

describe('validateEnvironment', () => {
  it('normalizes valid development configuration', () => {
    const result = validateEnvironment(validConfig());

    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(3000);
    expect(result.SWAGGER_ENABLED).toBe(true);
    expect(result.DID_ENCRYPTION_ACTIVE_KEY_ID).toBe('v1');
    expect(result.WALLET_ENCRYPTION_ACTIVE_KEY_ID).toBe('v1');
  });

  it('accepts a pooled Prisma Postgres URL using sslmode=require', () => {
    expect(() =>
      validateEnvironment(
        validConfig({
          DATABASE_URL:
            'postgresql://user:password@pooled.db.prisma.io:5432/postgres?sslmode=require',
        }),
      ),
    ).not.toThrow();
  });

  it('accepts a direct Prisma Postgres URL using sslmode=require', () => {
    expect(() =>
      validateEnvironment(
        validConfig({
          DATABASE_URL:
            'postgresql://user:password@db.prisma.io:5432/postgres?sslmode=require',
        }),
      ),
    ).not.toThrow();
  });

  it('accepts Prisma Postgres using sslmode=verify-full', () => {
    expect(() =>
      validateEnvironment(
        validConfig({
          DATABASE_URL:
            'postgresql://user:password@pooled.db.prisma.io:5432/postgres?sslmode=verify-full',
        }),
      ),
    ).not.toThrow();
  });

  it('rejects a Prisma Postgres URL without an approved SSL mode', () => {
    expect(() =>
      validateEnvironment(
        validConfig({
          DATABASE_URL:
            'postgresql://user:password@pooled.db.prisma.io:5432/postgres?sslmode=disable',
        }),
      ),
    ).toThrow(
      'DATABASE_URL for Prisma Postgres must use sslmode=require or sslmode=verify-full',
    );
  });

  it('rejects a remote non-Prisma PostgreSQL URL without verify-full', () => {
    expect(() =>
      validateEnvironment(
        validConfig({
          DATABASE_URL:
            'postgresql://user:password@db.example.com:5432/postgres?sslmode=require',
        }),
      ),
    ).toThrow(
      'DATABASE_URL for a remote PostgreSQL server must use sslmode=verify-full',
    );
  });

  it('rejects identical access and refresh JWT secrets', () => {
    expect(() =>
      validateEnvironment(
        validConfig({
          JWT_REFRESH_SECRET: ACCESS_SECRET,
        }),
      ),
    ).toThrow('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  });

  it('rejects malformed encryption keys', () => {
    expect(() =>
      validateEnvironment(
        validConfig({
          MASTER_ENCRYPTION_KEY: 'not-a-hex-key',
        }),
      ),
    ).toThrow('MASTER_ENCRYPTION_KEY must be a 32-byte hexadecimal value');
  });

  it('rejects reused DID and wallet encryption keys', () => {
    expect(() =>
      validateEnvironment(
        validConfig({
          WALLET_ENCRYPTION_KEY_V1: DID_KEY,
        }),
      ),
    ).toThrow('DID and wallet active encryption keys must be different');
  });

  it('requires the active encryption-key environment variable', () => {
    const config = validConfig();

    delete config.DID_ENCRYPTION_KEY_V1;

    expect(() => validateEnvironment(config)).toThrow(
      'DID_ENCRYPTION_KEY_V1 is required',
    );
  });

  it('requires TLS Redis and HTTPS CORS in production', () => {
    expect(() =>
      validateEnvironment(
        validConfig({
          NODE_ENV: 'production',
          REDIS_URL: 'redis://redis.example.com:6379',
          CORS_ORIGIN: 'https://app.example.com',
          SWAGGER_ENABLED: 'false',
        }),
      ),
    ).toThrow('REDIS_URL must use rediss:// in production');

    expect(() =>
      validateEnvironment(
        validConfig({
          NODE_ENV: 'production',
          REDIS_URL: 'rediss://default:password@redis.example.com:6379',
          CORS_ORIGIN: 'http://app.example.com',
          SWAGGER_ENABLED: 'false',
        }),
      ),
    ).toThrow(
      'Production CORS origins must use https://: http://app.example.com',
    );
  });

  it('rejects Swagger in production', () => {
    expect(() =>
      validateEnvironment(
        validConfig({
          NODE_ENV: 'production',
          REDIS_URL: 'rediss://default:password@redis.example.com:6379',
          CORS_ORIGIN: 'https://app.example.com',
          SWAGGER_ENABLED: 'true',
        }),
      ),
    ).toThrow('SWAGGER_ENABLED must be false in production');
  });
});
