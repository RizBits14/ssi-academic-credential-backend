-- CreateEnum
CREATE TYPE "TrustedIssuerStatus" AS ENUM ('TRUSTED', 'SUSPENDED', 'REVOKED');

-- CreateTable
CREATE TABLE "TrustedIssuer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "issuerDid" TEXT NOT NULL,
    "status" "TrustedIssuerStatus" NOT NULL DEFAULT 'TRUSTED',
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrustedIssuer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrustedIssuer_issuerDid_key" ON "TrustedIssuer"("issuerDid");

-- CreateIndex
CREATE INDEX "TrustedIssuer_organizationId_idx" ON "TrustedIssuer"("organizationId");

-- CreateIndex
CREATE INDEX "TrustedIssuer_status_idx" ON "TrustedIssuer"("status");

-- CreateIndex
CREATE INDEX "TrustedIssuer_approvedBy_idx" ON "TrustedIssuer"("approvedBy");

-- AddForeignKey
ALTER TABLE "TrustedIssuer" ADD CONSTRAINT "TrustedIssuer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustedIssuer" ADD CONSTRAINT "TrustedIssuer_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
