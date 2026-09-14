-- CreateEnum
CREATE TYPE "DidOwnerType" AS ENUM ('ORGANIZATION', 'USER');

-- CreateEnum
CREATE TYPE "DidStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateTable
CREATE TABLE "Did" (
    "id" TEXT NOT NULL,
    "did" TEXT NOT NULL,
    "ownerType" "DidOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "encryptedPrivateKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'Ed25519',
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "DidStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Did_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Did_did_key" ON "Did"("did");

-- CreateIndex
CREATE INDEX "Did_ownerType_ownerId_idx" ON "Did"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "Did_status_idx" ON "Did"("status");
