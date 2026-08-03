
-- CreateEnum
CREATE TYPE "MemoryScopeType" AS ENUM ('USER', 'ORGANIZATION', 'WORKSPACE', 'AGENT', 'WORKFLOW', 'CONVERSATION', 'TASK');

-- CreateEnum
CREATE TYPE "MemoryKind" AS ENUM ('LONG_TERM', 'TEMPORARY', 'DECISION', 'DOCUMENT', 'PREFERENCE');

-- CreateEnum
CREATE TYPE "KnowledgeSourceType" AS ENUM ('PDF', 'WORD', 'EXCEL', 'POWERPOINT', 'MARKDOWN', 'HTML', 'EMAIL', 'NOTE', 'CRM', 'QUOTE', 'INVOICE', 'CONVERSATION', 'LOG', 'DECISION', 'WORKFLOW', 'DOCUMENTATION', 'IMAGE', 'AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "KnowledgeDocumentStatus" AS ENUM ('PENDING', 'INDEXED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KnowledgeIndexAction" AS ENUM ('ADD', 'UPDATE', 'DELETE', 'RENAME', 'MOVE', 'REINDEX');

-- DropIndex
DROP INDEX "PromptTemplate_key_isActive_idx";

-- DropIndex
DROP INDEX "PromptTemplate_key_version_key";

-- AlterTable
ALTER TABLE "PromptTemplate" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'fr',
ADD COLUMN     "parentKey" TEXT,
ADD COLUMN     "variableSchema" JSONB;

-- CreateTable
CREATE TABLE "MemoryEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "scopeType" "MemoryScopeType" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "kind" "MemoryKind" NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "value" JSONB NOT NULL,
    "summary" TEXT,
    "compressed" BOOLEAN NOT NULL DEFAULT false,
    "ttlMs" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceType" "KnowledgeSourceType" NOT NULL,
    "sourceRef" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "metadata" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checksum" TEXT,
    "status" "KnowledgeDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "indexedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "embeddingModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeIndexLog" (
    "id" TEXT NOT NULL,
    "documentId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "action" "KnowledgeIndexAction" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "message" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeIndexLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmbeddingRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputCount" INTEGER NOT NULL,
    "dimensions" INTEGER,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmbeddingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemoryEntry_organizationId_scopeType_scopeId_key_isCurrent_idx" ON "MemoryEntry"("organizationId", "scopeType", "scopeId", "key", "isCurrent");

-- CreateIndex
CREATE INDEX "MemoryEntry_expiresAt_idx" ON "MemoryEntry"("expiresAt");

-- CreateIndex
CREATE INDEX "MemoryEntry_archivedAt_idx" ON "MemoryEntry"("archivedAt");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_organizationId_workspaceId_status_idx" ON "KnowledgeDocument"("organizationId", "workspaceId", "status");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_organizationId_workspaceId_sourceType_idx" ON "KnowledgeDocument"("organizationId", "workspaceId", "sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDocument_workspaceId_sourceType_sourceRef_key" ON "KnowledgeDocument"("workspaceId", "sourceType", "sourceRef");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeChunk_documentId_chunkIndex_key" ON "KnowledgeChunk"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "KnowledgeIndexLog_workspaceId_createdAt_idx" ON "KnowledgeIndexLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeIndexLog_documentId_idx" ON "KnowledgeIndexLog"("documentId");

-- CreateIndex
CREATE INDEX "EmbeddingRequest_organizationId_provider_idx" ON "EmbeddingRequest"("organizationId", "provider");

-- CreateIndex
CREATE INDEX "PromptTemplate_key_locale_isActive_idx" ON "PromptTemplate"("key", "locale", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_key_version_locale_key" ON "PromptTemplate"("key", "version", "locale");

-- AddForeignKey
ALTER TABLE "MemoryEntry" ADD CONSTRAINT "MemoryEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryEntry" ADD CONSTRAINT "MemoryEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryEntry" ADD CONSTRAINT "MemoryEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeIndexLog" ADD CONSTRAINT "KnowledgeIndexLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbeddingRequest" ADD CONSTRAINT "EmbeddingRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbeddingRequest" ADD CONSTRAINT "EmbeddingRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

