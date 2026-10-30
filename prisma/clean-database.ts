import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { assertSafeDatabaseMaintenance } from '../src/common/utils/database-maintenance-safety.util';
import { PrismaClient } from '../src/generated/prisma/client';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  // Also check inside the destructive script itself. This protects direct
  // execution, which would bypass the npm script's preliminary guard.
  assertSafeDatabaseMaintenance({
    command: 'db:clean',
    nodeEnvironment: process.env.NODE_ENV,
    vercelEnvironment: process.env.VERCEL_ENV,
    databaseUrl: connectionString,
    allowRemoteClean: process.env.DB_CLEAN_ALLOW_REMOTE,
    confirmTarget: process.env.DB_CLEAN_CONFIRM_TARGET,
  });

  if (!connectionString) {
    throw new Error('DATABASE_URL is not defined in the environment.');
  }

  const adapter = new PrismaPg({
    connectionString,
  });

  const prisma = new PrismaClient({
    adapter,
  });

  try {
    console.log('Starting full database cleanup...');

    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> '_prisma_migrations'
    `;

    if (tables.length === 0) {
      console.log('No application tables found.');
      return;
    }

    const quotedTableNames = tables
      .map(({ tablename }) => {
        const escapedName = tablename.replace(/"/g, '""');

        return `"public"."${escapedName}"`;
      })
      .join(', ');

    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${quotedTableNames} RESTART IDENTITY CASCADE;`,
    );

    console.log('Database cleanup completed successfully.');
    console.log(`Cleared ${tables.length} application table(s).`);
    console.log('Prisma migration history was preserved.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Database cleanup failed:');

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
});
