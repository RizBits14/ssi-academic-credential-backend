import 'dotenv/config';

import { assertSafeDatabaseMaintenance } from '../src/common/utils/database-maintenance-safety.util';

const command = process.argv[2] ?? 'database maintenance command';

try {
  assertSafeDatabaseMaintenance({
    command,
    nodeEnvironment: process.env.NODE_ENV,
    vercelEnvironment: process.env.VERCEL_ENV,
    databaseUrl: process.env.DATABASE_URL,
    allowRemoteClean: process.env.DB_CLEAN_ALLOW_REMOTE,
    confirmTarget: process.env.DB_CLEAN_CONFIRM_TARGET,
  });
} catch (error: unknown) {
  console.error(
    `[safety] ${error instanceof Error ? error.message : 'Database maintenance blocked.'}`,
  );

  process.exit(1);
}
