-- CreateEnum
CREATE TYPE "QuestContext" AS ENUM ('HOME', 'WORK', 'OUTSIDE', 'COMPUTER', 'PHONE');

-- AlterTable
ALTER TABLE "Quest" ADD COLUMN     "context" "QuestContext";
