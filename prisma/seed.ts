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
  const hashPassword = () =>
    argon2.hash(seedPassword, {
      type: argon2.argon2id,
    });

  const [
    systemAdminPasswordHash,
    issuerAdminPasswordHash,
    verifierAdminPasswordHash,
    holderPasswordHash,
  ] = await Promise.all([
    hashPassword(),
    hashPassword(),
    hashPassword(),
    hashPassword(),
  ]);

  const systemAdmin = await prisma.user.upsert({
    where: {
      email: 'zara.whitmoren@credentialbridge.example',
    },
    update: {
      name: 'Zara Whitmore',
      passwordHash: systemAdminPasswordHash,
      role: UserRole.SYSTEM_ADMIN,
    },
    create: {
      name: 'Zara Whitmore',
      email: 'zara.whitmoren@credentialbridge.example',
      passwordHash: systemAdminPasswordHash,
      role: UserRole.SYSTEM_ADMIN,
    },
  });

  const university = await prisma.organization.upsert({
    where: {
      slug: 'northbridge-university',
    },
    update: {
      name: 'Northbridge University',
      type: OrganizationType.UNIVERSITY,
      email: 'registrar@northbridge.edu.example',
      website: 'https://northbridge.edu.example',
    },
    create: {
      name: 'Northbridge University',
      slug: 'northbridge-university',
      type: OrganizationType.UNIVERSITY,
      email: 'registrar@northbridge.edu.example',
      website: 'https://northbridge.edu.example',
    },
  });

  const issuerAdmin = await prisma.user.upsert({
    where: {
      email: 'ethan.blake@northbridge.edu.example',
    },
    update: {
      name: 'Ethan Blake',
      passwordHash: issuerAdminPasswordHash,
      role: UserRole.ISSUER_ADMIN,
    },
    create: {
      name: 'Ethan Blake',
      email: 'ethan.blake@northbridge.edu.example',
      passwordHash: issuerAdminPasswordHash,
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
      slug: 'meridian-commercial-bank',
    },
    update: {
      name: 'Meridian Commercial Bank PLC',
      type: OrganizationType.BANK,
      email: 'careers@meridianbank.example',
      website: 'https://meridianbank.example',
    },
    create: {
      name: 'Meridian Commercial Bank PLC',
      slug: 'meridian-commercial-bank',
      type: OrganizationType.BANK,
      email: 'careers@meridianbank.example',
      website: 'https://meridianbank.example',
    },
  });

  const verifierAdmin = await prisma.user.upsert({
    where: {
      email: 'amelia.rose@meridianbank.example',
    },
    update: {
      name: 'Amelia Rose',
      passwordHash: verifierAdminPasswordHash,
      role: UserRole.VERIFIER_ADMIN,
    },
    create: {
      name: 'Amelia Rose',
      email: 'amelia.rose@meridianbank.example',
      passwordHash: verifierAdminPasswordHash,
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

  const holder = await prisma.user.upsert({
    where: {
      email: 'lucas.kennete@mail.example',
    },
    update: {
      name: 'Lucas Kennete',
      passwordHash: holderPasswordHash,
      role: UserRole.HOLDER,
    },
    create: {
      name: 'Lucas Kennete',
      email: 'lucas.kennete@mail.example',
      passwordHash: holderPasswordHash,
      role: UserRole.HOLDER,
    },
  });

  console.log('Database seed completed successfully.');
  console.log(`System admin: ${systemAdmin.email}`);
  console.log(`Issuer admin: ${issuerAdmin.email}`);
  console.log(`Verifier admin: ${verifierAdmin.email}`);
  console.log(`Holder: ${holder.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
