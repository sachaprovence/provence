-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'COMMERCIAL', 'OPERATOR', 'ACCOUNTANT', 'SUPPORT', 'VIEWER');

-- CreateEnum
CREATE TYPE "WorkspaceInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "activeWorkspaceId" TEXT;

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMembership" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceInvitation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "token" TEXT NOT NULL,
    "status" "WorkspaceInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workspace_organizationId_idx" ON "Workspace"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_organizationId_slug_key" ON "Workspace"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "WorkspaceMembership_workspaceId_idx" ON "WorkspaceMembership"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceMembership_userId_idx" ON "WorkspaceMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMembership_workspaceId_userId_key" ON "WorkspaceMembership"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvitation_token_key" ON "WorkspaceInvitation"("token");

-- CreateIndex
CREATE INDEX "WorkspaceInvitation_workspaceId_idx" ON "WorkspaceInvitation"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceInvitation_email_idx" ON "WorkspaceInvitation"("email");

-- CreateIndex
CREATE INDEX "Lead_workspaceId_idx" ON "Lead"("workspaceId");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_activeWorkspaceId_fkey" FOREIGN KEY ("activeWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill (voir ADR 0005/0006) : cette migration n'est que ADDITIVE
-- (nouvelles tables, nouvelles colonnes nullable) — aucune table, colonne ou
-- ligne existante n'est modifiée ou supprimée. Elle est donc réversible sans
-- perte de données : une migration de retrait ultérieure ("DROP TABLE
-- Workspace/WorkspaceMembership/WorkspaceInvitation", "ALTER TABLE Lead DROP
-- COLUMN workspaceId", "ALTER TABLE Session DROP COLUMN
-- activeWorkspaceId") ramènerait exactement au schéma précédent.
--
-- 1) Un workspace par défaut par organisation existante (idempotent : ne
--    crée rien si l'organisation a déjà un workspace par défaut).
INSERT INTO "Workspace" (id, "organizationId", name, slug, "isDefault", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o.id, o.name, 'principal', true, now(), now()
FROM "Organization" o
WHERE NOT EXISTS (
  SELECT 1 FROM "Workspace" w WHERE w."organizationId" = o.id AND w."isDefault" = true
);

-- 2) Une WorkspaceMembership par Membership existant, dans le workspace par
--    défaut de son organisation, avec le mapping de rôle documenté en ADR
--    0006 (OWNER_ADMIN -> OWNER, SALES -> COMMERCIAL, PROVIDER -> OPERATOR).
--    Idempotent via ON CONFLICT (contrainte unique workspaceId+userId).
INSERT INTO "WorkspaceMembership" (id, "workspaceId", "userId", role, "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  w.id,
  m."userId",
  CASE m.role
    WHEN 'OWNER_ADMIN' THEN 'OWNER'
    WHEN 'SALES' THEN 'COMMERCIAL'
    WHEN 'PROVIDER' THEN 'OPERATOR'
  END::"WorkspaceRole",
  now(),
  now()
FROM "Membership" m
JOIN "Workspace" w ON w."organizationId" = m."organizationId" AND w."isDefault" = true
ON CONFLICT ("workspaceId", "userId") DO NOTHING;

-- 3) Rattachement des prospects existants au workspace par défaut de leur
--    organisation (uniquement ceux qui n'ont pas déjà un workspaceId).
UPDATE "Lead" l
SET "workspaceId" = w.id
FROM "Workspace" w
WHERE w."organizationId" = l."organizationId"
  AND w."isDefault" = true
  AND l."workspaceId" IS NULL;
