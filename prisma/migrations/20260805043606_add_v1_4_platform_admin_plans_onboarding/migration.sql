-- CreateEnum
CREATE TYPE "OnboardingStepKey" AS ENUM ('PROFILE', 'INVITE_TEAM', 'CONNECT_TOOL', 'CHOOSE_TEMPLATE', 'LAUNCH_DEMO', 'VIEW_RESULT');

-- AlterEnum
ALTER TYPE "PlanKey" ADD VALUE 'TRIAL';

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "maxAutomationRuns" INTEGER,
ADD COLUMN     "maxConnectors" INTEGER,
ADD COLUMN     "maxStorageMb" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OnboardingProgress" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "currentStep" "OnboardingStepKey" NOT NULL DEFAULT 'PROFILE',
    "completedSteps" "OnboardingStepKey"[] DEFAULT ARRAY[]::"OnboardingStepKey"[],
    "selectedTemplateKey" TEXT,
    "demoAutomationId" TEXT,
    "demoRunId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_organizationId_key" ON "OnboardingProgress"("organizationId");

-- CreateIndex
CREATE INDEX "OnboardingProgress_organizationId_idx" ON "OnboardingProgress"("organizationId");

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
