-- CreateTable
CREATE TABLE "CredentialStatusHistory" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "previousStatus" "CredentialStatus" NOT NULL,
    "newStatus" "CredentialStatus" NOT NULL,
    "reason" TEXT,
    "changedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredentialStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CredentialStatusHistory_credentialId_idx" ON "CredentialStatusHistory"("credentialId");

-- CreateIndex
CREATE INDEX "CredentialStatusHistory_changedBy_idx" ON "CredentialStatusHistory"("changedBy");

-- CreateIndex
CREATE INDEX "CredentialStatusHistory_newStatus_idx" ON "CredentialStatusHistory"("newStatus");

-- CreateIndex
CREATE INDEX "CredentialStatusHistory_createdAt_idx" ON "CredentialStatusHistory"("createdAt");

-- AddForeignKey
ALTER TABLE "CredentialStatusHistory" ADD CONSTRAINT "CredentialStatusHistory_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialStatusHistory" ADD CONSTRAINT "CredentialStatusHistory_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
