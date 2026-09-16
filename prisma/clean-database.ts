import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

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
