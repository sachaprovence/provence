
-- CreateEnum
CREATE TYPE "AutomationDefinitionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "AutomationRunTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'EVENT', 'WEBHOOK', 'API', 'AUTOMATION');

-- CreateEnum
CREATE TYPE "AutomationJobStatus" AS ENUM ('QUEUED', 'CLAIMED', 'RUNNING', 'WAITING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'DEAD_LETTERED');

-- CreateEnum
CREATE TYPE "AutomationCircuitState" AS ENUM ('CLOSED', 'OPEN', 'HALF_OPEN');

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "workspaceId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "status" "AutomationDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "sourceTemplateKey" TEXT,
    "activeVersionId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationVersion" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "graph" JSONB NOT NULL,
    "changelog" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationTriggerBinding" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "automationVersionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "triggerKey" TEXT NOT NULL,
    "config" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationTriggerBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "automationVersionId" TEXT NOT NULL,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'QUEUED',
    "trigger" "AutomationRunTrigger" NOT NULL DEFAULT 'MANUAL',
    "triggerKey" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB,
    "context" JSONB,
    "output" JSONB,
    "error" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resumeAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "parentRunId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRunLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "nodeId" TEXT,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "automationId" TEXT,
    "automationRunId" TEXT,
    "nodeId" TEXT,
    "jobType" TEXT NOT NULL,
    "status" "AutomationJobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB,
    "output" JSONB,
    "error" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "retryPolicy" JSONB,
    "lockKey" TEXT,
    "concurrencyKey" TEXT,
    "timeoutMs" INTEGER,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "claimedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "resumeAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationJobLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationJobLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationLock" (
    "id" TEXT NOT NULL,
    "lockKey" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "AutomationLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationCircuitBreaker" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "automationId" TEXT,
    "state" "AutomationCircuitState" NOT NULL DEFAULT 'CLOSED',
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "resetAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationCircuitBreaker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Automation_activeVersionId_key" ON "Automation"("activeVersionId");

-- CreateIndex
CREATE INDEX "Automation_organizationId_idx" ON "Automation"("organizationId");

-- CreateIndex
CREATE INDEX "Automation_workspaceId_status_idx" ON "Automation"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Automation_isTemplate_idx" ON "Automation"("isTemplate");

-- CreateIndex
CREATE UNIQUE INDEX "Automation_workspaceId_key_key" ON "Automation"("workspaceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationVersion_automationId_version_key" ON "AutomationVersion"("automationId", "version");

-- CreateIndex
CREATE INDEX "AutomationTriggerBinding_workspaceId_triggerKey_isActive_idx" ON "AutomationTriggerBinding"("workspaceId", "triggerKey", "isActive");

-- CreateIndex
CREATE INDEX "AutomationTriggerBinding_automationId_idx" ON "AutomationTriggerBinding"("automationId");

-- CreateIndex
CREATE INDEX "AutomationRun_automationId_status_idx" ON "AutomationRun"("automationId", "status");

-- CreateIndex
CREATE INDEX "AutomationRun_workspaceId_status_idx" ON "AutomationRun"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "AutomationRun_status_scheduledAt_idx" ON "AutomationRun"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "AutomationRun_status_resumeAt_idx" ON "AutomationRun"("status", "resumeAt");

-- CreateIndex
CREATE INDEX "AutomationRunLog_runId_createdAt_idx" ON "AutomationRunLog"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationJob_status_scheduledAt_idx" ON "AutomationJob"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "AutomationJob_status_resumeAt_idx" ON "AutomationJob"("status", "resumeAt");

-- CreateIndex
CREATE INDEX "AutomationJob_organizationId_workspaceId_status_idx" ON "AutomationJob"("organizationId", "workspaceId", "status");

-- CreateIndex
CREATE INDEX "AutomationJob_concurrencyKey_status_idx" ON "AutomationJob"("concurrencyKey", "status");

-- CreateIndex
CREATE INDEX "AutomationJob_lockKey_idx" ON "AutomationJob"("lockKey");

-- CreateIndex
CREATE INDEX "AutomationJob_automationRunId_idx" ON "AutomationJob"("automationRunId");

-- CreateIndex
CREATE INDEX "AutomationJob_automationId_idx" ON "AutomationJob"("automationId");

-- CreateIndex
CREATE INDEX "AutomationJobLog_jobId_createdAt_idx" ON "AutomationJobLog"("jobId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationLock_lockKey_key" ON "AutomationLock"("lockKey");

-- CreateIndex
CREATE INDEX "AutomationLock_expiresAt_idx" ON "AutomationLock"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationCircuitBreaker_key_key" ON "AutomationCircuitBreaker"("key");

-- CreateIndex
CREATE INDEX "AutomationCircuitBreaker_automationId_idx" ON "AutomationCircuitBreaker"("automationId");

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "AutomationVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationVersion" ADD CONSTRAINT "AutomationVersion_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationVersion" ADD CONSTRAINT "AutomationVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationTriggerBinding" ADD CONSTRAINT "AutomationTriggerBinding_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationTriggerBinding" ADD CONSTRAINT "AutomationTriggerBinding_automationVersionId_fkey" FOREIGN KEY ("automationVersionId") REFERENCES "AutomationVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationTriggerBinding" ADD CONSTRAINT "AutomationTriggerBinding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_automationVersionId_fkey" FOREIGN KEY ("automationVersionId") REFERENCES "AutomationVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "AutomationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRunLog" ADD CONSTRAINT "AutomationRunLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_automationRunId_fkey" FOREIGN KEY ("automationRunId") REFERENCES "AutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationJobLog" ADD CONSTRAINT "AutomationJobLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AutomationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationCircuitBreaker" ADD CONSTRAINT "AutomationCircuitBreaker_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

