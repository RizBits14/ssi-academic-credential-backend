import 'dotenv/config';

const requestedCommand = process.argv[2] ?? 'database maintenance command';

const nodeEnvironment = process.env.NODE_ENV?.trim().toLowerCase();
const vercelEnvironment = process.env.VERCEL_ENV?.trim().toLowerCase();

if (nodeEnvironment === 'production' || vercelEnvironment === 'production') {
  console.error(
    `[safety] Refusing to run ${requestedCommand} in a production environment.`,
  );

  process.exit(1);
}
