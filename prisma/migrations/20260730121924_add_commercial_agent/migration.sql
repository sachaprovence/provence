-- CreateEnum
CREATE TYPE "CommercialStage" AS ENUM ('NEW', 'TO_QUALIFY', 'QUALIFIED', 'FIRST_CONTACT', 'FOLLOW_UP', 'MEETING', 'QUOTE_SENT', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "CommercialActionType" AS ENUM ('EMAIL_DRAFT', 'FOLLOW_UP', 'QUOTE_DRAFT', 'PROPOSAL', 'RECOMMENDATION');

-- CreateEnum
CREATE TYPE "CommercialActionStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SENT', 'DISMISSED');

-- CreateTable
CREATE TABLE "CommercialProspect" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "sector" TEXT,
    "companySize" TEXT,
    "website" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "stage" "CommercialStage" NOT NULL DEFAULT 'NEW',
    "score" INTEGER,
    "scoreBreakdown" JSONB,
    "potentialEstimate" JSONB,
    "qualificationNotes" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialProspect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialAction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "type" "CommercialActionType" NOT NULL,
    "status" "CommercialActionStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reasoning" TEXT,
    "autoApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "CommercialAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommercialProspect_workspaceId_stage_idx" ON "CommercialProspect"("workspaceId", "stage");

-- CreateIndex
CREATE INDEX "CommercialProspect_installationId_idx" ON "CommercialProspect"("installationId");

-- CreateIndex
CREATE INDEX "CommercialAction_workspaceId_status_idx" ON "CommercialAction"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "CommercialAction_prospectId_idx" ON "CommercialAction"("prospectId");

-- CreateIndex
CREATE INDEX "PromptTemplate_key_isActive_idx" ON "PromptTemplate"("key", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_key_version_key" ON "PromptTemplate"("key", "version");

-- AddForeignKey
ALTER TABLE "CommercialProspect" ADD CONSTRAINT "CommercialProspect_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialProspect" ADD CONSTRAINT "CommercialProspect_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialProspect" ADD CONSTRAINT "CommercialProspect_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "AgentInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialAction" ADD CONSTRAINT "CommercialAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialAction" ADD CONSTRAINT "CommercialAction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialAction" ADD CONSTRAINT "CommercialAction_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "CommercialProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialAction" ADD CONSTRAINT "CommercialAction_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "AgentInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialAction" ADD CONSTRAINT "CommercialAction_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptTemplate" ADD CONSTRAINT "PromptTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
