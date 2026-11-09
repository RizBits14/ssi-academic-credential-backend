-- CreateTable
CREATE TABLE "CredentialSchema" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "schemaJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CredentialSchema_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CredentialSchema_organizationId_idx" ON "CredentialSchema"("organizationId");

-- CreateIndex
CREATE INDEX "CredentialSchema_status_idx" ON "CredentialSchema"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CredentialSchema_organizationId_name_version_key" ON "CredentialSchema"("organizationId", "name", "version");

-- AddForeignKey
ALTER TABLE "CredentialSchema" ADD CONSTRAINT "CredentialSchema_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
