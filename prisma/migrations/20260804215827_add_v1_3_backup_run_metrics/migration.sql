-- CreateEnum
CREATE TYPE "BackupRunKind" AS ENUM ('DATABASE_DUMP', 'DATABASE_RESTORE_VERIFY', 'S3_BACKUP', 'S3_RESTORE_VERIFY');

-- CreateTable
CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL,
    "kind" "BackupRunKind" NOT NULL,
    "success" BOOLEAN NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "sizeBytes" INTEGER,
    "sha256" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackupRun_kind_createdAt_idx" ON "BackupRun"("kind", "createdAt");
