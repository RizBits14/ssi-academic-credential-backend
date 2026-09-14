import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

import { PrismaClient } from '../src/generated/prisma/client';
import { OrganizationType, UserRole } from '../src/generated/prisma/enums';

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for database seeding`);
  }

  return value;
}

const databaseUrl = getRequiredEnv('DATABASE_URL');
const seedPassword = getRequiredEnv('SEED_DEFAULT_PASSWORD');

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const passwordHash = await argon2.hash(seedPassword, {
    type: argon2.argon2id,
  });

  const systemAdmin = await prisma.user.upsert({
    where: {
      email: 'system.admin@example.com',
    },
    update: {
      name: 'System Administrator',
      passwordHash,
      role: UserRole.SYSTEM_ADMIN,
    },
    create: {
      name: 'System Administrator',
      email: 'system.admin@example.com',
      passwordHash,
      role: UserRole.SYSTEM_ADMIN,
    },
  });

  const university = await prisma.organization.upsert({
    where: {
      slug: 'example-university',
    },
    update: {
      name: 'Example University',
      type: OrganizationType.UNIVERSITY,
      email: 'contact@example-university.edu',
    },
    create: {
      name: 'Example University',
      slug: 'example-university',
      type: OrganizationType.UNIVERSITY,
      email: 'contact@example-university.edu',
    },
  });

  const issuerAdmin = await prisma.user.upsert({
    where: {
      email: 'issuer.admin@example.com',
    },
    update: {
      name: 'University Administrator',
      passwordHash,
      role: UserRole.ISSUER_ADMIN,
    },
    create: {
      name: 'University Administrator',
      email: 'issuer.admin@example.com',
      passwordHash,
      role: UserRole.ISSUER_ADMIN,
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: university.id,
        userId: issuerAdmin.id,
      },
    },
    update: {},
    create: {
      organizationId: university.id,
      userId: issuerAdmin.id,
    },
  });

  const bank = await prisma.organization.upsert({
    where: {
      slug: 'example-bank',
    },
    update: {
      name: 'Example Bank',
      type: OrganizationType.BANK,
      email: 'contact@example-bank.com',
    },
    create: {
      name: 'Example Bank',
      slug: 'example-bank',
      type: OrganizationType.BANK,
      email: 'contact@example-bank.com',
    },
  });

  const verifierAdmin = await prisma.user.upsert({
    where: {
      email: 'verifier.admin@example.com',
    },
    update: {
      name: 'Bank HR Administrator',
      passwordHash,
      role: UserRole.VERIFIER_ADMIN,
    },
    create: {
      name: 'Bank HR Administrator',
      email: 'verifier.admin@example.com',
      passwordHash,
      role: UserRole.VERIFIER_ADMIN,
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: bank.id,
        userId: verifierAdmin.id,
      },
    },
    update: {},
    create: {
      organizationId: bank.id,
      userId: verifierAdmin.id,
    },
  });

  console.log('Database seed completed successfully.');
  console.log(`System admin: ${systemAdmin.email}`);
  console.log(`Issuer admin: ${issuerAdmin.email}`);
  console.log(`Verifier admin: ${verifierAdmin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
