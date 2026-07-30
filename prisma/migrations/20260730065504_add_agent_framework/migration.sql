-- CreateEnum
CREATE TYPE "AgentDefinitionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DEPRECATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AgentInstallationStatus" AS ENUM ('INSTALLED', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'UNINSTALLED');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "AgentRunTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'EVENT', 'API');

-- CreateEnum
CREATE TYPE "AgentMemoryScope" AS ENUM ('SHORT_TERM', 'PERSISTENT', 'SHARED');

-- CreateEnum
CREATE TYPE "AgentMessageType" AS ENUM ('TASK_REQUEST', 'TASK_RESPONSE', 'RESULT', 'ERROR', 'INTERVENTION_REQUEST', 'INFO');

-- CreateEnum
CREATE TYPE "AgentMessageStatus" AS ENUM ('PENDING', 'DELIVERED', 'READ', 'ACTIONED');

-- CreateEnum
CREATE TYPE "AgentInterventionStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AgentScheduleKind" AS ENUM ('ONE_OFF', 'RECURRING', 'EVENT');

-- AlterTable
ALTER TABLE "AIRequest" ADD COLUMN     "agentRunId" TEXT;

-- CreateTable
CREATE TABLE "AgentDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL DEFAULT '0.1.0',
    "status" "AgentDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
    "author" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "icon" TEXT,
    "runtimeKey" TEXT NOT NULL,
    "configSchema" JSONB,
    "declaredToolKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "declaredPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "compatibleAiModels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultLimits" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentInstallation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "status" "AgentInstallationStatus" NOT NULL DEFAULT 'INSTALLED',
    "config" JSONB,
    "grantedToolKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "grantedPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "usageLimits" JSONB,
    "installedById" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTool" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "inputSchema" JSONB,
    "outputSchema" JSONB,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "trigger" "AgentRunTrigger" NOT NULL DEFAULT 'MANUAL',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB,
    "output" JSONB,
    "error" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "parentRunId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRunLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMemoryEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "installationId" TEXT,
    "scope" "AgentMemoryScope" NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "embedding" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMemoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromInstallationId" TEXT,
    "toInstallationId" TEXT,
    "runId" TEXT,
    "type" "AgentMessageType" NOT NULL,
    "status" "AgentMessageStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentInterventionRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "runId" TEXT,
    "messageId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "AgentInterventionStatus" NOT NULL DEFAULT 'PENDING',
    "assignedToUserId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentInterventionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSchedule" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "kind" "AgentScheduleKind" NOT NULL,
    "cronExpression" TEXT,
    "runAt" TIMESTAMP(3),
    "eventKey" TEXT,
    "input" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentDefinition_status_idx" ON "AgentDefinition"("status");

-- CreateIndex
CREATE INDEX "AgentDefinition_category_idx" ON "AgentDefinition"("category");

-- CreateIndex
CREATE UNIQUE INDEX "AgentDefinition_organizationId_key_key" ON "AgentDefinition"("organizationId", "key");

-- CreateIndex
CREATE INDEX "AgentInstallation_organizationId_idx" ON "AgentInstallation"("organizationId");

-- CreateIndex
CREATE INDEX "AgentInstallation_workspaceId_status_idx" ON "AgentInstallation"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentInstallation_workspaceId_definitionId_key" ON "AgentInstallation"("workspaceId", "definitionId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTool_key_key" ON "AgentTool"("key");

-- CreateIndex
CREATE INDEX "AgentTool_category_idx" ON "AgentTool"("category");

-- CreateIndex
CREATE INDEX "AgentRun_installationId_status_idx" ON "AgentRun"("installationId", "status");

-- CreateIndex
CREATE INDEX "AgentRun_status_scheduledAt_idx" ON "AgentRun"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "AgentRunLog_runId_idx" ON "AgentRunLog"("runId");

-- CreateIndex
CREATE INDEX "AgentMemoryEntry_workspaceId_scope_key_idx" ON "AgentMemoryEntry"("workspaceId", "scope", "key");

-- CreateIndex
CREATE INDEX "AgentMemoryEntry_installationId_scope_key_idx" ON "AgentMemoryEntry"("installationId", "scope", "key");

-- CreateIndex
CREATE INDEX "AgentMemoryEntry_expiresAt_idx" ON "AgentMemoryEntry"("expiresAt");

-- CreateIndex
CREATE INDEX "AgentMessage_workspaceId_createdAt_idx" ON "AgentMessage"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentMessage_toInstallationId_idx" ON "AgentMessage"("toInstallationId");

-- CreateIndex
CREATE INDEX "AgentMessage_fromInstallationId_idx" ON "AgentMessage"("fromInstallationId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentInterventionRequest_messageId_key" ON "AgentInterventionRequest"("messageId");

-- CreateIndex
CREATE INDEX "AgentInterventionRequest_workspaceId_status_idx" ON "AgentInterventionRequest"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "AgentSchedule_installationId_idx" ON "AgentSchedule"("installationId");

-- CreateIndex
CREATE INDEX "AgentSchedule_isActive_nextRunAt_idx" ON "AgentSchedule"("isActive", "nextRunAt");

-- CreateIndex
CREATE INDEX "AIRequest_agentRunId_idx" ON "AIRequest"("agentRunId");

-- AddForeignKey
ALTER TABLE "AIRequest" ADD CONSTRAINT "AIRequest_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDefinition" ADD CONSTRAINT "AgentDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInstallation" ADD CONSTRAINT "AgentInstallation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInstallation" ADD CONSTRAINT "AgentInstallation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInstallation" ADD CONSTRAINT "AgentInstallation_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "AgentDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInstallation" ADD CONSTRAINT "AgentInstallation_installedById_fkey" FOREIGN KEY ("installedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "AgentInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunLog" ADD CONSTRAINT "AgentRunLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMemoryEntry" ADD CONSTRAINT "AgentMemoryEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMemoryEntry" ADD CONSTRAINT "AgentMemoryEntry_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "AgentInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_fromInstallationId_fkey" FOREIGN KEY ("fromInstallationId") REFERENCES "AgentInstallation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_toInstallationId_fkey" FOREIGN KEY ("toInstallationId") REFERENCES "AgentInstallation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInterventionRequest" ADD CONSTRAINT "AgentInterventionRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInterventionRequest" ADD CONSTRAINT "AgentInterventionRequest_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "AgentInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInterventionRequest" ADD CONSTRAINT "AgentInterventionRequest_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInterventionRequest" ADD CONSTRAINT "AgentInterventionRequest_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AgentMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInterventionRequest" ADD CONSTRAINT "AgentInterventionRequest_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInterventionRequest" ADD CONSTRAINT "AgentInterventionRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSchedule" ADD CONSTRAINT "AgentSchedule_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "AgentInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
