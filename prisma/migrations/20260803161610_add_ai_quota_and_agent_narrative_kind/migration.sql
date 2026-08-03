-- AlterEnum
ALTER TYPE "AIRequestKind" ADD VALUE 'AGENT_NARRATIVE';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "aiMonthlyBudgetUsd" DOUBLE PRECISION;
