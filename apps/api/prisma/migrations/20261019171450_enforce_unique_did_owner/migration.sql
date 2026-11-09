/*
  Warnings:

  - A unique constraint covering the columns `[ownerType,ownerId]` on the table `Did` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Did_ownerType_ownerId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Did_ownerType_ownerId_key" ON "Did"("ownerType", "ownerId");
