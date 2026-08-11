import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { nextConfidence, type MemoryCandidate } from "./ai/memory-engine";
import { writeQuestAuditLog } from "./audit";

/**
 * Persiste des candidats de mémoire (§13-14 du brief) : une observation
 * confirme et renforce une mémoire existante (confiance progressive, jamais
 * un saut brutal), sans jamais ressusciter une mémoire explicitement
 * supprimée par l'utilisateur (§36, contrôle utilisateur).
 */
export async function applyMemoryObservations(userId: string, candidates: MemoryCandidate[]) {
  for (const candidate of candidates) {
    const existing = await prisma.questMemory.findFirst({ where: { userId, type: candidate.type, content: candidate.content } });
    if (existing) {
      if (!existing.active) continue;
      await prisma.questMemory.update({
        where: { id: existing.id },
        data: {
          confidence: existing.confirmedByUser ? existing.confidence : nextConfidence(existing.confidence, existing.observationCount + 1),
          observationCount: { increment: 1 },
          lastObservedAt: new Date(),
        },
      });
    } else {
      await prisma.questMemory.create({
        data: {
          userId,
          type: candidate.type,
          content: candidate.content,
          confidence: candidate.confidenceHint,
          sourceType: "behavior_pattern",
          observationCount: 1,
        },
      });
    }
  }
}

export async function listMemories(userId: string) {
  return prisma.questMemory.findMany({ where: { userId, active: true }, orderBy: { confidence: "desc" } });
}

export async function getActiveMemoriesForPrompt(userId: string) {
  const memories = await prisma.questMemory.findMany({
    where: { userId, active: true, confidence: { gte: 0.5 } },
    orderBy: { confidence: "desc" },
    take: 5,
  });
  return memories.map((m) => ({ type: m.type, content: m.content }));
}

export async function confirmMemory(userId: string, memoryId: string) {
  const memory = await prisma.questMemory.findFirst({ where: { id: memoryId, userId } });
  if (!memory) throw new NotFoundError("Mémoire introuvable.");
  const updated = await prisma.questMemory.update({
    where: { id: memoryId },
    data: { confirmedByUser: true, confidence: Math.max(memory.confidence, 0.9) },
  });
  await writeQuestAuditLog({ userId, action: "memory.confirmed", entityType: "QuestMemory", entityId: memoryId });
  return updated;
}

export async function deleteMemory(userId: string, memoryId: string) {
  const memory = await prisma.questMemory.findFirst({ where: { id: memoryId, userId } });
  if (!memory) throw new NotFoundError("Mémoire introuvable.");
  await prisma.questMemory.update({ where: { id: memoryId }, data: { active: false, confirmedByUser: false } });
  await writeQuestAuditLog({ userId, action: "memory.deleted", entityType: "QuestMemory", entityId: memoryId });
}
