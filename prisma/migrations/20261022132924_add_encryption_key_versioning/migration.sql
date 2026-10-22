-- AlterTable
ALTER TABLE "DidKey" ADD COLUMN     "encryptionKeyId" TEXT;

-- AlterTable
ALTER TABLE "WalletCredential" ADD COLUMN     "encryptionKeyId" TEXT;

-- CreateIndex
CREATE INDEX "DidKey_encryptionKeyId_idx" ON "DidKey"("encryptionKeyId");

-- CreateIndex
CREATE INDEX "WalletCredential_encryptionKeyId_idx" ON "WalletCredential"("encryptionKeyId");
