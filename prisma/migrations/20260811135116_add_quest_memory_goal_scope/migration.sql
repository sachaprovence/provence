-- AlterTable
ALTER TABLE "QuestMemory" ADD COLUMN     "goalId" TEXT;

-- CreateIndex
CREATE INDEX "QuestMemory_goalId_idx" ON "QuestMemory"("goalId");

-- AddForeignKey
ALTER TABLE "QuestMemory" ADD CONSTRAINT "QuestMemory_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "QuestGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
