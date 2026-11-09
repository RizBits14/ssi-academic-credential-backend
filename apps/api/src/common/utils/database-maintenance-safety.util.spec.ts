import { describe, expect, it } from '@jest/globals';

import { assertSafeDatabaseMaintenance } from './database-maintenance-safety.util';

const LOCAL_URL = 'postgresql://user:password@localhost:5432/ssi_dev';

const REMOTE_URL =
  'postgresql://user:password@pooled.db.prisma.io:5432/postgres?sslmode=verify-full';

const safeDevelopment = {
  command: 'db:clean',
  nodeEnvironment: 'development',
  databaseUrl: LOCAL_URL,
};

describe('assertSafeDatabaseMaintenance', () => {
  it('allows cleanup of an explicitly development local database', () => {
    expect(() => assertSafeDatabaseMaintenance(safeDevelopment)).not.toThrow();
  });

  it('allows cleanup of a local test database', () => {
    expect(() =>
      assertSafeDatabaseMaintenance({
        ...safeDevelopment,
        nodeEnvironment: 'test',
        databaseUrl: 'postgresql://user:password@127.0.0.1:5432/ssi_test',
      }),
    ).not.toThrow();
  });

  it('allows the IPv6 loopback hostname', () => {
    expect(() =>
      assertSafeDatabaseMaintenance({
        ...safeDevelopment,
        databaseUrl: 'postgresql://user:password@[::1]:5432/ssi_dev',
      }),
    ).not.toThrow();
  });

  it('refuses production even when the database is local', () => {
    expect(() =>
      assertSafeDatabaseMaintenance({
        ...safeDevelopment,
        nodeEnvironment: 'production',
      }),
    ).toThrow('production environment');
  });

  it('refuses a production Vercel environment even when NODE_ENV is development', () => {
    expect(() =>
      assertSafeDatabaseMaintenance({
        ...safeDevelopment,
        vercelEnvironment: 'production',
      }),
    ).toThrow('production environment');
  });

  it('requires an explicit environment for destructive commands', () => {
    expect(() =>
      assertSafeDatabaseMaintenance({
        ...safeDevelopment,
        nodeEnvironment: undefined,
      }),
    ).toThrow('requires NODE_ENV=development or NODE_ENV=test');
  });

  it('does not block ordinary development seeding', () => {
    expect(() =>
      assertSafeDatabaseMaintenance({
        command: 'db:seed',
        nodeEnvironment: 'development',
      }),
    ).not.toThrow();
  });

  it('still blocks ordinary seeding in production', () => {
    expect(() =>
      assertSafeDatabaseMaintenance({
        command: 'db:seed',
        nodeEnvironment: 'production',
      }),
    ).toThrow('production environment');
  });

  it('requires a database URL for destructive commands', () => {
    expect(() =>
      assertSafeDatabaseMaintenance({
        ...safeDevelopment,
        databaseUrl: undefined,
      }),
    ).toThrow('DATABASE_URL is required');
  });

  it('rejects invalid or non-PostgreSQL database URLs', () => {
    expect(() =>
      assertSafeDatabaseMaintenance({
        ...safeDevelopment,
        databaseUrl: 'not a url',
      }),
    ).toThrow('valid PostgreSQL URL');

    expect(() =>
      assertSafeDatabaseMaintenance({
        ...safeDevelopment,
        databaseUrl: 'mysql://user:password@localhost:3306/ssi_dev',
      }),
    ).toThrow('requires a PostgreSQL URL');
  });

  it('rejects a URL without a database name', () => {
    expect(() =>
      assertSafeDatabaseMaintenance({
        ...safeDevelopment,
        databaseUrl: 'postgresql://user:password@localhost:5432/',
      }),
    ).toThrow('must identify a database host and name');
  });

  it('blocks remote development databases by default', () => {
    expect(() =>
      assertSafeDatabaseMaintenance({
        ...safeDevelopment,
        databaseUrl: REMOTE_URL,
      }),
    ).toThrow('Remote database cleanup is blocked');
  });

  it('does not authorize remote cleanup without exact target confirmation', () => {
    expect(() =>
      assertSafeDatabaseMaintenance({
        ...safeDevelopment,
        databaseUrl: REMOTE_URL,
        allowRemoteClean: 'true',
        confirmTarget: 'pooled.db.prisma.io/another_database',
      }),
    ).toThrow('Remote database cleanup is blocked');
  });

  it('allows remote development cleanup only with both explicit confirmations', () => {
    expect(() =>
      assertSafeDatabaseMaintenance({
        ...safeDevelopment,
        databaseUrl: REMOTE_URL,
        allowRemoteClean: 'true',
        confirmTarget: 'pooled.db.prisma.io/postgres',
      }),
    ).not.toThrow();
  });

  it('also guards the compound clean-and-seed command', () => {
    expect(() =>
      assertSafeDatabaseMaintenance({
        ...safeDevelopment,
        command: 'db:clean:seed',
        databaseUrl: REMOTE_URL,
      }),
    ).toThrow('Remote database cleanup is blocked');
  });
});
