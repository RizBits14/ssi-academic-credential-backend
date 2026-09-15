-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requiredClaims" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_bankId_idx" ON "Job"("bankId");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
