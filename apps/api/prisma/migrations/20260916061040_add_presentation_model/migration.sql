-- CreateTable
CREATE TABLE "Presentation" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "holderDid" TEXT NOT NULL,
    "disclosedClaims" JSONB NOT NULL,
    "nonce" TEXT NOT NULL,
    "presentationHash" TEXT NOT NULL,
    "holderProof" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Presentation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Presentation_requestId_key" ON "Presentation"("requestId");

-- CreateIndex
CREATE INDEX "Presentation_credentialId_idx" ON "Presentation"("credentialId");

-- CreateIndex
CREATE INDEX "Presentation_holderId_idx" ON "Presentation"("holderId");

-- CreateIndex
CREATE INDEX "Presentation_createdAt_idx" ON "Presentation"("createdAt");

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "VerificationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
