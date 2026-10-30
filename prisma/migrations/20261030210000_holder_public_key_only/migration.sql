-- Allow client-controlled DID keys without any server-stored private key.
-- Existing encrypted server-managed keys are preserved unchanged.
ALTER TABLE "DidKey"
  ALTER COLUMN "encryptedPrivateKey" DROP NOT NULL,
  ALTER COLUMN "iv" DROP NOT NULL,
  ALTER COLUMN "authTag" DROP NOT NULL;

-- Ensure private-key ciphertext, nonce, and authentication tag are
-- either present together or absent together.
ALTER TABLE "DidKey"
  ADD CONSTRAINT "DidKey_private_key_material_consistent"
  CHECK (
    (
      "encryptedPrivateKey" IS NULL
      AND "iv" IS NULL
      AND "authTag" IS NULL
      AND "encryptionKeyId" IS NULL
    )
    OR (
      "encryptedPrivateKey" IS NOT NULL
      AND "iv" IS NOT NULL
      AND "authTag" IS NOT NULL
    )
  );
