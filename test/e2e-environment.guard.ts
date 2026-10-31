import 'dotenv/config';

const nodeEnvironment = process.env.NODE_ENV?.trim().toLowerCase();
const vercelEnvironment = process.env.VERCEL_ENV?.trim().toLowerCase();

if (nodeEnvironment === 'production' || vercelEnvironment === 'production') {
  throw new Error('E2E tests must not run in production environments');
}

if (process.env.E2E_ALLOW_DATABASE_MUTATIONS !== 'true') {
  throw new Error(
    'E2E tests require E2E_ALLOW_DATABASE_MUTATIONS=true for an isolated non-production test database',
  );
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for E2E tests');
}
