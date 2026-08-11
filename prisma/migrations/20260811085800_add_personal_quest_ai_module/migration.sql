-- CreateEnum
CREATE TYPE "QuestGoalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestGoalPriority" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateEnum
CREATE TYPE "QuestMilestoneStatus" AS ENUM ('PENDING', 'ACTIVE', 'DONE');

-- CreateEnum
CREATE TYPE "QuestType" AS ENUM ('MICRO', 'SHORT', 'NORMAL', 'DEEP', 'HABIT', 'CHALLENGE', 'BOSS');

-- CreateEnum
CREATE TYPE "QuestStatus" AS ENUM ('PENDING', 'ACTIVE', 'DONE', 'POSTPONED', 'BLOCKED', 'REPLACED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "QuestFeedbackAction" AS ENUM ('COMPLETED', 'POSTPONED', 'TOO_HARD', 'TOO_EASY', 'BLOCKED', 'REPLACED');

-- CreateEnum
CREATE TYPE "QuestMemoryType" AS ENUM ('TIMING_PREFERENCE', 'DURATION_PREFERENCE', 'TASK_TYPE_RESISTANCE', 'SUPPORT_NEED', 'SUCCESS_PATTERN', 'AVAILABILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "QuestConversationRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "QuestUserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionStyle" TEXT,
    "regularityScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "enduranceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "autonomyScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "difficultyTolerance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "shortTaskPreference" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "effectiveHours" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "challengeScore" INTEGER NOT NULL DEFAULT 40,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestUserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "motivation" TEXT,
    "currentState" TEXT,
    "targetState" TEXT,
    "deadline" TIMESTAMP(3),
    "priority" "QuestGoalPriority" NOT NULL DEFAULT 'SECONDARY',
    "status" "QuestGoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "progressPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficultyEstimate" INTEGER,
    "successMetrics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "obstacles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestMilestone" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "status" "QuestMilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "parentQuestId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "why" TEXT,
    "instructions" TEXT,
    "type" "QuestType" NOT NULL DEFAULT 'NORMAL',
    "status" "QuestStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "difficulty" INTEGER NOT NULL DEFAULT 3,
    "challengeScore" INTEGER NOT NULL DEFAULT 40,
    "estimatedMinutes" INTEGER NOT NULL,
    "actualMinutes" INTEGER,
    "impactWeight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "xpReward" INTEGER NOT NULL DEFAULT 20,
    "scheduledAt" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "generationReason" TEXT,

    CONSTRAINT "Quest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestDependency" (
    "id" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,

    CONSTRAINT "QuestDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestFeedback" (
    "id" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "QuestFeedbackAction" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "QuestMemoryType" NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "observationCount" INTEGER NOT NULL DEFAULT 1,
    "confirmedByUser" BOOLEAN,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestXPTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questId" TEXT,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestXPTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestUserStat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xpTotal" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "streakCurrent" INTEGER NOT NULL DEFAULT 0,
    "streakBest" INTEGER NOT NULL DEFAULT 0,
    "activeDays7" INTEGER NOT NULL DEFAULT 0,
    "activeDays30" INTEGER NOT NULL DEFAULT 0,
    "momentum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "disciplineScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "constanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastActiveAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestUserStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestCheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "energy" INTEGER,
    "motivation" INTEGER,
    "availableMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "QuestConversationRole" NOT NULL,
    "content" TEXT NOT NULL,
    "actions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestWeeklyReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "questsCompleted" INTEGER NOT NULL DEFAULT 0,
    "xpGained" INTEGER NOT NULL DEFAULT 0,
    "goalsProgress" JSONB,
    "observations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suggestions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestWeeklyReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestInsight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "basedOn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuestUserProfile_userId_key" ON "QuestUserProfile"("userId");

-- CreateIndex
CREATE INDEX "QuestGoal_userId_status_idx" ON "QuestGoal"("userId", "status");

-- CreateIndex
CREATE INDEX "QuestMilestone_goalId_order_idx" ON "QuestMilestone"("goalId", "order");

-- CreateIndex
CREATE INDEX "Quest_userId_status_idx" ON "Quest"("userId", "status");

-- CreateIndex
CREATE INDEX "Quest_goalId_idx" ON "Quest"("goalId");

-- CreateIndex
CREATE INDEX "Quest_milestoneId_idx" ON "Quest"("milestoneId");

-- CreateIndex
CREATE INDEX "QuestDependency_questId_idx" ON "QuestDependency"("questId");

-- CreateIndex
CREATE INDEX "QuestDependency_dependsOnId_idx" ON "QuestDependency"("dependsOnId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestDependency_questId_dependsOnId_key" ON "QuestDependency"("questId", "dependsOnId");

-- CreateIndex
CREATE INDEX "QuestFeedback_questId_idx" ON "QuestFeedback"("questId");

-- CreateIndex
CREATE INDEX "QuestFeedback_userId_createdAt_idx" ON "QuestFeedback"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestMemory_userId_active_idx" ON "QuestMemory"("userId", "active");

-- CreateIndex
CREATE INDEX "QuestMemory_userId_type_idx" ON "QuestMemory"("userId", "type");

-- CreateIndex
CREATE INDEX "QuestXPTransaction_userId_createdAt_idx" ON "QuestXPTransaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuestUserStat_userId_key" ON "QuestUserStat"("userId");

-- CreateIndex
CREATE INDEX "QuestCheckIn_userId_createdAt_idx" ON "QuestCheckIn"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestConversation_userId_updatedAt_idx" ON "QuestConversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "QuestConversationMessage_conversationId_createdAt_idx" ON "QuestConversationMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuestWeeklyReview_userId_weekStart_key" ON "QuestWeeklyReview"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "QuestInsight_userId_active_idx" ON "QuestInsight"("userId", "active");

-- CreateIndex
CREATE INDEX "QuestAuditLog_userId_createdAt_idx" ON "QuestAuditLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "QuestUserProfile" ADD CONSTRAINT "QuestUserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestGoal" ADD CONSTRAINT "QuestGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestMilestone" ADD CONSTRAINT "QuestMilestone_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "QuestGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "QuestGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "QuestMilestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_parentQuestId_fkey" FOREIGN KEY ("parentQuestId") REFERENCES "Quest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestDependency" ADD CONSTRAINT "QuestDependency_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestDependency" ADD CONSTRAINT "QuestDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "Quest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestFeedback" ADD CONSTRAINT "QuestFeedback_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestFeedback" ADD CONSTRAINT "QuestFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestMemory" ADD CONSTRAINT "QuestMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestXPTransaction" ADD CONSTRAINT "QuestXPTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestXPTransaction" ADD CONSTRAINT "QuestXPTransaction_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestUserStat" ADD CONSTRAINT "QuestUserStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestCheckIn" ADD CONSTRAINT "QuestCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestConversation" ADD CONSTRAINT "QuestConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestConversationMessage" ADD CONSTRAINT "QuestConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "QuestConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestWeeklyReview" ADD CONSTRAINT "QuestWeeklyReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestInsight" ADD CONSTRAINT "QuestInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestAuditLog" ADD CONSTRAINT "QuestAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
