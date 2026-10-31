type AppEnvironment = 'development' | 'test' | 'production';

const KEY_ID_PATTERN = /^[a-z0-9_]+$/;
const HEX_32_BYTE_PATTERN = /^[a-fA-F0-9]{64}$/;
const DURATION_PATTERN = /^\d+(?:ms|s|m|h|d|w)$/i;

function requireString(config: Record<string, unknown>, name: string): string {
  const value = config[name];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }

  return value.trim();
}

function optionalString(
  config: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = config[name];

  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`${name} must be a string`);
  }

  return value.trim();
}

function validateNodeEnvironment(value: string): AppEnvironment {
  if (value !== 'development' && value !== 'test' && value !== 'production') {
    throw new Error('NODE_ENV must be one of: development, test, production');
  }

  return value;
}

function validatePort(value: unknown): number {
  const port =
    value === undefined || value === null || value === ''
      ? 3000
      : Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return port;
}

function validateBoolean(
  value: unknown,
  name: string,
  defaultValue: boolean,
): boolean {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    throw new Error(`${name} must be true or false`);
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  throw new Error(`${name} must be true or false`);
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]'
  );
}

function isPrismaPostgresHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  return normalized === 'pooled.db.prisma.io' || normalized === 'db.prisma.io';
}

export function validatePostgresUrl(value: string, name: string): void {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL`);
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`${name} must use postgresql:// or postgres://`);
  }

  if (!parsed.hostname) {
    throw new Error(`${name} must include a database hostname`);
  }

  if (isLocalHostname(parsed.hostname)) {
    return;
  }

  const sslMode = parsed.searchParams.get('sslmode')?.toLowerCase();

  if (isPrismaPostgresHostname(parsed.hostname)) {
    if (sslMode !== 'require' && sslMode !== 'verify-full') {
      throw new Error(
        `${name} for Prisma Postgres must use sslmode=require or sslmode=verify-full`,
      );
    }

    return;
  }

  if (sslMode !== 'verify-full') {
    throw new Error(
      `${name} for a remote PostgreSQL server must use sslmode=verify-full`,
    );
  }
}

function validateRedisUrl(value: string, nodeEnv: AppEnvironment): void {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error('REDIS_URL must be a valid Redis URL');
  }

  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use redis:// or rediss://');
  }

  if (!parsed.hostname) {
    throw new Error('REDIS_URL must include a hostname');
  }

  if (nodeEnv === 'production' && parsed.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use rediss:// in production');
  }
}

function validateCorsOrigins(value: string, nodeEnv: AppEnvironment): string {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error('CORS_ORIGIN must contain at least one origin');
  }

  const normalizedOrigins = origins.map((origin) => {
    if (origin === '*') {
      throw new Error('CORS_ORIGIN must not contain a wildcard origin');
    }

    let parsed: URL;

    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`CORS origin must use http:// or https://: ${origin}`);
    }

    if (parsed.origin !== origin) {
      throw new Error(
        `CORS origin must contain only scheme, host, and optional port: ${origin}`,
      );
    }

    if (nodeEnv === 'production') {
      if (parsed.protocol !== 'https:') {
        throw new Error(`Production CORS origins must use https://: ${origin}`);
      }

      if (isLocalHostname(parsed.hostname)) {
        throw new Error(
          `Production CORS origins must not use localhost: ${origin}`,
        );
      }
    }

    return parsed.origin;
  });

  return [...new Set(normalizedOrigins)].join(',');
}

function validateDuration(value: string, name: string): void {
  if (!DURATION_PATTERN.test(value)) {
    throw new Error(`${name} must use a duration such as 15m, 1h, or 7d`);
  }
}

function validateHexKey(value: string, name: string): void {
  if (!HEX_32_BYTE_PATTERN.test(value)) {
    throw new Error(`${name} must be a 32-byte hexadecimal value`);
  }
}

function validateActiveEncryptionKey(
  config: Record<string, unknown>,
  domain: 'DID' | 'WALLET',
): {
  keyId: string;
  key: string;
  environmentKey: string;
} {
  const activeKeyIdName = `${domain}_ENCRYPTION_ACTIVE_KEY_ID`;
  const keyId = requireString(config, activeKeyIdName).toLowerCase();

  if (!KEY_ID_PATTERN.test(keyId)) {
    throw new Error(
      `${activeKeyIdName} must contain only lowercase letters, numbers, and underscores`,
    );
  }

  const environmentKey = `${domain}_ENCRYPTION_KEY_${keyId.toUpperCase()}`;
  const key = requireString(config, environmentKey);

  validateHexKey(key, environmentKey);

  return {
    keyId,
    key,
    environmentKey,
  };
}

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const validated: Record<string, unknown> = {
    ...config,
  };

  const nodeEnv = validateNodeEnvironment(
    optionalString(config, 'NODE_ENV') ?? 'development',
  );

  validated.NODE_ENV = nodeEnv;
  validated.PORT = validatePort(config.PORT);

  const databaseUrl = requireString(config, 'DATABASE_URL');
  validatePostgresUrl(databaseUrl, 'DATABASE_URL');
  validated.DATABASE_URL = databaseUrl;

  const directUrl = optionalString(config, 'DIRECT_URL');

  if (directUrl) {
    validatePostgresUrl(directUrl, 'DIRECT_URL');
    validated.DIRECT_URL = directUrl;
  }

  const redisUrl = requireString(config, 'REDIS_URL');
  validateRedisUrl(redisUrl, nodeEnv);
  validated.REDIS_URL = redisUrl;

  const jwtAccessSecret = requireString(config, 'JWT_ACCESS_SECRET');
  const jwtRefreshSecret = requireString(config, 'JWT_REFRESH_SECRET');

  if (jwtAccessSecret === jwtRefreshSecret) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
    );
  }

  if (nodeEnv === 'production') {
    if (jwtAccessSecret.length < 32) {
      throw new Error(
        'JWT_ACCESS_SECRET must be at least 32 characters in production',
      );
    }

    if (jwtRefreshSecret.length < 32) {
      throw new Error(
        'JWT_REFRESH_SECRET must be at least 32 characters in production',
      );
    }
  }

  validated.JWT_ACCESS_SECRET = jwtAccessSecret;
  validated.JWT_REFRESH_SECRET = jwtRefreshSecret;

  const accessExpiresIn = requireString(config, 'JWT_ACCESS_EXPIRES_IN');
  const refreshExpiresIn = requireString(config, 'JWT_REFRESH_EXPIRES_IN');

  validateDuration(accessExpiresIn, 'JWT_ACCESS_EXPIRES_IN');
  validateDuration(refreshExpiresIn, 'JWT_REFRESH_EXPIRES_IN');

  validated.JWT_ACCESS_EXPIRES_IN = accessExpiresIn;
  validated.JWT_REFRESH_EXPIRES_IN = refreshExpiresIn;

  const masterEncryptionKey = requireString(config, 'MASTER_ENCRYPTION_KEY');

  validateHexKey(masterEncryptionKey, 'MASTER_ENCRYPTION_KEY');
  validated.MASTER_ENCRYPTION_KEY = masterEncryptionKey;

  const didKey = validateActiveEncryptionKey(config, 'DID');
  const walletKey = validateActiveEncryptionKey(config, 'WALLET');

  const normalizedMasterKey = masterEncryptionKey.toLowerCase();
  const normalizedDidKey = didKey.key.toLowerCase();
  const normalizedWalletKey = walletKey.key.toLowerCase();

  if (normalizedDidKey === normalizedWalletKey) {
    throw new Error('DID and wallet active encryption keys must be different');
  }

  if (
    normalizedMasterKey === normalizedDidKey ||
    normalizedMasterKey === normalizedWalletKey
  ) {
    throw new Error(
      'MASTER_ENCRYPTION_KEY must be different from active DID and wallet encryption keys',
    );
  }

  validated.DID_ENCRYPTION_ACTIVE_KEY_ID = didKey.keyId;
  validated[didKey.environmentKey] = didKey.key;
  validated.WALLET_ENCRYPTION_ACTIVE_KEY_ID = walletKey.keyId;
  validated[walletKey.environmentKey] = walletKey.key;

  const corsOrigin = validateCorsOrigins(
    requireString(config, 'CORS_ORIGIN'),
    nodeEnv,
  );

  validated.CORS_ORIGIN = corsOrigin;

  const swaggerEnabled = validateBoolean(
    config.SWAGGER_ENABLED,
    'SWAGGER_ENABLED',
    nodeEnv !== 'production',
  );

  if (nodeEnv === 'production' && swaggerEnabled) {
    throw new Error('SWAGGER_ENABLED must be false in production');
  }

  validated.SWAGGER_ENABLED = swaggerEnabled;

  return validated;
}
