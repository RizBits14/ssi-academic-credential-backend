/*
  Warnings:

  - You are about to drop the column `algorithm` on the `Did` table. All the data in the column will be lost.
  - You are about to drop the column `authTag` on the `Did` table. All the data in the column will be lost.
  - You are about to drop the column `encryptedPrivateKey` on the `Did` table. All the data in the column will be lost.
  - You are about to drop the column `iv` on the `Did` table. All the data in the column will be lost.
  - You are about to drop the column `keyVersion` on the `Did` table. All the data in the column will be lost.
  - You are about to drop the column `publicKey` on the `Did` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "DidKeyStatus" AS ENUM ('ACTIVE', 'RETIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "Did" DROP COLUMN "algorithm",
DROP COLUMN "authTag",
DROP COLUMN "encryptedPrivateKey",
DROP COLUMN "iv",
DROP COLUMN "keyVersion",
DROP COLUMN "publicKey",
ADD COLUMN     "currentKeyVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "DidKey" (
    "id" TEXT NOT NULL,
    "didId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "publicKey" TEXT NOT NULL,
    "encryptedPrivateKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'Ed25519',
    "status" "DidKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "retiredAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DidKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DidKey_didId_status_idx" ON "DidKey"("didId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DidKey_didId_version_key" ON "DidKey"("didId", "version");

-- AddForeignKey
ALTER TABLE "DidKey" ADD CONSTRAINT "DidKey_didId_fkey" FOREIGN KEY ("didId") REFERENCES "Did"("id") ON DELETE CASCADE ON UPDATE CASCADE;
