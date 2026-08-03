
-- CreateEnum
CREATE TYPE "QuoteSignatureStatus" AS ENUM ('NONE', 'PENDING', 'SIGNED', 'DECLINED');

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "signatureProvider" TEXT,
ADD COLUMN     "signatureStatus" "QuoteSignatureStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signerEmail" TEXT,
ADD COLUMN     "signerName" TEXT,
ADD COLUMN     "subtotalAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vatAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 20;

-- Backfill des devis existants (créés avant la remise/TVA/versionnement, v0.9) :
-- on suppose qu'aucune TVA n'était appliquée (le champ n'existait pas), donc
-- subtotalAmount = totalAmount déjà stocké, sans régression sur le montant affiché.
UPDATE "Quote" SET "subtotalAmount" = "totalAmount" WHERE "subtotalAmount" = 0;

