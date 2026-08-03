-- CreateEnum
CREATE TYPE "AgentPlanStatus" AS ENUM ('DRAFT', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentPlanStepStatus" AS ENUM ('PENDING', 'READY', 'DELEGATED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "AgentRunTrigger" ADD VALUE 'AGENT';

-- CreateTable
CREATE TABLE "AgentPlan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "runId" TEXT,
    "goal" TEXT NOT NULL,
    "status" "AgentPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AgentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPlanStep" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "objective" TEXT NOT NULL,
    "targetInstallationId" TEXT,
    "targetCategory" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "dependsOnStepIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredToolKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "input" JSONB,
    "status" "AgentPlanStepStatus" NOT NULL DEFAULT 'PENDING',
    "subRunId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "result" JSONB,
    "error" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPlanStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentPlan_runId_key" ON "AgentPlan"("runId");

-- CreateIndex
CREATE INDEX "AgentPlan_workspaceId_status_idx" ON "AgentPlan"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "AgentPlan_installationId_idx" ON "AgentPlan"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentPlanStep_subRunId_key" ON "AgentPlanStep"("subRunId");

-- CreateIndex
CREATE INDEX "AgentPlanStep_planId_stepIndex_idx" ON "AgentPlanStep"("planId", "stepIndex");

-- CreateIndex
CREATE INDEX "AgentPlanStep_targetInstallationId_idx" ON "AgentPlanStep"("targetInstallationId");

-- AddForeignKey
ALTER TABLE "AgentPlan" ADD CONSTRAINT "AgentPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPlan" ADD CONSTRAINT "AgentPlan_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "AgentInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPlan" ADD CONSTRAINT "AgentPlan_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPlanStep" ADD CONSTRAINT "AgentPlanStep_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AgentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPlanStep" ADD CONSTRAINT "AgentPlanStep_targetInstallationId_fkey" FOREIGN KEY ("targetInstallationId") REFERENCES "AgentInstallation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPlanStep" ADD CONSTRAINT "AgentPlanStep_subRunId_fkey" FOREIGN KEY ("subRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
