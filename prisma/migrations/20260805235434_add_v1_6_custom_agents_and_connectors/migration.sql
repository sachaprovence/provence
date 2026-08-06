-- CreateEnum
CREATE TYPE "CustomAgentChatRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntegrationKind" ADD VALUE 'SLACK';
ALTER TYPE "IntegrationKind" ADD VALUE 'DISCORD';

-- CreateTable
CREATE TABLE "CustomAgent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "systemPrompt" TEXT,
    "providerKey" TEXT NOT NULL DEFAULT 'demo',
    "model" TEXT,
    "toolKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "memoryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "CustomAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomAgentConversation" (
    "id" TEXT NOT NULL,
    "customAgentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Nouvelle conversation',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "CustomAgentConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomAgentChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "CustomAgentChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolKey" TEXT,
    "toolInput" JSONB,
    "toolOutput" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomAgentChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomAgent_organizationId_archivedAt_idx" ON "CustomAgent"("organizationId", "archivedAt");

-- CreateIndex
CREATE INDEX "CustomAgent_workspaceId_archivedAt_idx" ON "CustomAgent"("workspaceId", "archivedAt");

-- CreateIndex
CREATE INDEX "CustomAgentConversation_customAgentId_updatedAt_idx" ON "CustomAgentConversation"("customAgentId", "updatedAt");

-- CreateIndex
CREATE INDEX "CustomAgentConversation_organizationId_idx" ON "CustomAgentConversation"("organizationId");

-- CreateIndex
CREATE INDEX "CustomAgentConversation_workspaceId_idx" ON "CustomAgentConversation"("workspaceId");

-- CreateIndex
CREATE INDEX "CustomAgentChatMessage_conversationId_createdAt_idx" ON "CustomAgentChatMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomAgent" ADD CONSTRAINT "CustomAgent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomAgent" ADD CONSTRAINT "CustomAgent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomAgent" ADD CONSTRAINT "CustomAgent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomAgentConversation" ADD CONSTRAINT "CustomAgentConversation_customAgentId_fkey" FOREIGN KEY ("customAgentId") REFERENCES "CustomAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomAgentConversation" ADD CONSTRAINT "CustomAgentConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomAgentConversation" ADD CONSTRAINT "CustomAgentConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomAgentConversation" ADD CONSTRAINT "CustomAgentConversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomAgentChatMessage" ADD CONSTRAINT "CustomAgentChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CustomAgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
