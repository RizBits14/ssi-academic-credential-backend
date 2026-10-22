/*
  Warnings:

  - A unique constraint covering the columns `[didId]` on the table `DidKey` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "DidKey_one_active_key_per_did_key" ON "DidKey"("didId") WHERE ("status" = 'ACTIVE');
