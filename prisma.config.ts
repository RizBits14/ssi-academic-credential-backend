import 'dotenv/config';

import { defineConfig } from 'prisma/config';
import { validatePostgresUrl } from './src/config/environment.validation';

const migrationDatabaseUrl =
  process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'];

if (!migrationDatabaseUrl) {
  throw new Error(
    'DIRECT_URL or DATABASE_URL must be configured for Prisma CLI commands',
  );
}

validatePostgresUrl(
  migrationDatabaseUrl,
  process.env['DIRECT_URL'] !== undefined ? 'DIRECT_URL' : 'DATABASE_URL',
);

export default defineConfig({
  schema: 'prisma/schema.prisma',

  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },

  datasource: {
    url: migrationDatabaseUrl,
  },
});
