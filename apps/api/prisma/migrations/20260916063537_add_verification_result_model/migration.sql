-- CreateEnum
CREATE TYPE "VerificationFinalResult" AS ENUM ('VERIFIED', 'FAILED');

-- CreateTable
CREATE TABLE "VerificationResult" (
    "id" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "requestValid" BOOLEAN NOT NULL,
    "nonceValid" BOOLEAN NOT NULL,
    "holderProofValid" BOOLEAN NOT NULL,
    "hashValid" BOOLEAN NOT NULL,
    "issuerSignatureValid" BOOLEAN NOT NULL,
    "issuerTrusted" BOOLEAN NOT NULL,
    "credentialStatusValid" BOOLEAN NOT NULL,
    "schemaValid" BOOLEAN NOT NULL,
    "holderMatches" BOOLEAN NOT NULL,
    "claimsValid" BOOLEAN NOT NULL,
    "finalResult" "VerificationFinalResult" NOT NULL,
    "failureReason" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VerificationResult_presentationId_key" ON "VerificationResult"("presentationId");

-- CreateIndex
CREATE INDEX "VerificationResult_applicationId_idx" ON "VerificationResult"("applicationId");

-- CreateIndex
CREATE INDEX "VerificationResult_finalResult_idx" ON "VerificationResult"("finalResult");

-- CreateIndex
CREATE INDEX "VerificationResult_verifiedAt_idx" ON "VerificationResult"("verifiedAt");

-- AddForeignKey
ALTER TABLE "VerificationResult" ADD CONSTRAINT "VerificationResult_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationResult" ADD CONSTRAINT "VerificationResult_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
