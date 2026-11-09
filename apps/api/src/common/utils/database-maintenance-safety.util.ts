interface DatabaseMaintenanceSafetyInput {
  command: string;
  nodeEnvironment?: string;
  vercelEnvironment?: string;
  databaseUrl?: string;
  allowRemoteClean?: string;
  confirmTarget?: string;
}

const DESTRUCTIVE_COMMANDS = new Set(['db:clean', 'db:clean:seed']);

function normalizeEnvironment(value?: string): string | undefined {
  return value?.trim().toLowerCase();
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '[::1]' ||
    normalized === '::1'
  );
}

/**
 * Prevents accidental cleanup of production or remote databases.
 *
 * This function is deliberately independent of NestJS and Prisma, so that
 * both the command guard and the cleanup script itself can enforce it.
 */
export function assertSafeDatabaseMaintenance(
  input: DatabaseMaintenanceSafetyInput,
): void {
  const nodeEnvironment = normalizeEnvironment(input.nodeEnvironment);
  const vercelEnvironment = normalizeEnvironment(input.vercelEnvironment);

  if (nodeEnvironment === 'production' || vercelEnvironment === 'production') {
    throw new Error(
      `Refusing to run ${input.command} in a production environment.`,
    );
  }

  if (!DESTRUCTIVE_COMMANDS.has(input.command)) {
    return;
  }

  if (nodeEnvironment !== 'development' && nodeEnvironment !== 'test') {
    throw new Error(
      `${input.command} requires NODE_ENV=development or NODE_ENV=test.`,
    );
  }

  if (!input.databaseUrl) {
    throw new Error('DATABASE_URL is required for database cleanup.');
  }

  let url: URL;

  try {
    url = new URL(input.databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('Database cleanup requires a PostgreSQL URL.');
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));

  if (!url.hostname || !databaseName) {
    throw new Error('DATABASE_URL must identify a database host and name.');
  }

  if (isLoopbackHostname(url.hostname)) {
    return;
  }

  const target = `${url.hostname}/${databaseName}`;

  if (
    input.allowRemoteClean?.trim().toLowerCase() !== 'true' ||
    input.confirmTarget !== target
  ) {
    throw new Error(
      `Remote database cleanup is blocked for ${target}. ` +
        'To explicitly authorize this development/test target, set ' +
        'DB_CLEAN_ALLOW_REMOTE=true and DB_CLEAN_CONFIRM_TARGET=' +
        target +
        '. Never enable these settings for a production database.',
    );
  }
}
