import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { DidService } from '../src/did/did.service';
import { DidOwnerType } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  console.log('Starting initial DID setup...');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
    abortOnError: false,
  });

  try {
    const prisma = app.get(PrismaService);
    const didService = app.get(DidService);

    const university = await prisma.organization.findUnique({
      where: {
        slug: 'example-university',
      },
    });

    const bank = await prisma.organization.findUnique({
      where: {
        slug: 'example-bank',
      },
    });

    const holder = await prisma.user.findUnique({
      where: {
        email: 'applicant@example.com',
      },
    });

    if (!university) {
      throw new Error('Seeded university was not found');
    }

    if (!bank) {
      throw new Error('Seeded bank was not found');
    }

    if (!holder) {
      throw new Error('Seeded holder was not found');
    }

    let universityDid = await didService.findByOwner(
      DidOwnerType.ORGANIZATION,
      university.id,
    );

    if (!universityDid) {
      universityDid = await didService.createForOrganization(university.id);
    }

    let bankDid = await didService.findByOwner(
      DidOwnerType.ORGANIZATION,
      bank.id,
    );

    if (!bankDid) {
      bankDid = await didService.createForOrganization(bank.id);
    }

    let holderDid = await didService.findByOwner(DidOwnerType.USER, holder.id);

    if (!holderDid) {
      holderDid = await didService.createForUser(holder.id);
    }

    console.log('Initial DID setup completed successfully.');
    console.log(`University DID: ${universityDid.did}`);
    console.log(`Bank DID: ${bankDid.did}`);
    console.log(`Holder DID: ${holderDid.did}`);
  } finally {
    await app.close();
  }
}

main()
  .then(() => {
    console.log('DID setup script finished.');
  })
  .catch((error) => {
    console.error('DID setup failed:');
    console.error(error);
    process.exitCode = 1;
  });
