
-- AlterTable
ALTER TABLE "KnowledgeDocument" ADD COLUMN     "lastUsedAt" TIMESTAMP(3),
ADD COLUMN     "usageCount" INTEGER NOT NULL DEFAULT 0;

