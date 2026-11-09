-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "vcId" TEXT NOT NULL,
    "issuerOrganizationId" TEXT NOT NULL,
    "issuerDid" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "holderDid" TEXT NOT NULL,
    "schemaId" TEXT NOT NULL,
    "academicRecordId" TEXT NOT NULL,
    "credentialHash" TEXT NOT NULL,
    "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletCredential" (
    "id" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Credential_vcId_key" ON "Credential"("vcId");

-- CreateIndex
CREATE INDEX "Credential_issuerOrganizationId_idx" ON "Credential"("issuerOrganizationId");

-- CreateIndex
CREATE INDEX "Credential_holderId_idx" ON "Credential"("holderId");

-- CreateIndex
CREATE INDEX "Credential_schemaId_idx" ON "Credential"("schemaId");

-- CreateIndex
CREATE INDEX "Credential_academicRecordId_idx" ON "Credential"("academicRecordId");

-- CreateIndex
CREATE INDEX "Credential_status_idx" ON "Credential"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WalletCredential_credentialId_key" ON "WalletCredential"("credentialId");

-- CreateIndex
CREATE INDEX "WalletCredential_holderId_idx" ON "WalletCredential"("holderId");

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_issuerOrganizationId_fkey" FOREIGN KEY ("issuerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_schemaId_fkey" FOREIGN KEY ("schemaId") REFERENCES "CredentialSchema"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_academicRecordId_fkey" FOREIGN KEY ("academicRecordId") REFERENCES "AcademicRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletCredential" ADD CONSTRAINT "WalletCredential_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletCredential" ADD CONSTRAINT "WalletCredential_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
