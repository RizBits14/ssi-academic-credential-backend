-- CreateEnum
CREATE TYPE "AcademicRecordStatus" AS ENUM ('ACTIVE', 'GRADUATED', 'WITHDRAWN', 'INVALID');

-- CreateTable
CREATE TABLE "AcademicRecord" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "degree" TEXT NOT NULL,
    "department" TEXT,
    "major" TEXT NOT NULL,
    "cgpa" DECIMAL(65,30),
    "graduationYear" INTEGER NOT NULL,
    "graduationDate" TIMESTAMP(3),
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademicRecord_universityId_idx" ON "AcademicRecord"("universityId");

-- CreateIndex
CREATE INDEX "AcademicRecord_holderId_idx" ON "AcademicRecord"("holderId");

-- CreateIndex
CREATE INDEX "AcademicRecord_status_idx" ON "AcademicRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicRecord_universityId_studentId_key" ON "AcademicRecord"("universityId", "studentId");

-- AddForeignKey
ALTER TABLE "AcademicRecord" ADD CONSTRAINT "AcademicRecord_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicRecord" ADD CONSTRAINT "AcademicRecord_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
