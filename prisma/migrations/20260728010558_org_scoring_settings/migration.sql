-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "requireMessageValidation" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "scoringRules" JSONB;
