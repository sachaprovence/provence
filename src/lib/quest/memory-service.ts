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
 *
 * `goalId` : `null` = mémoire globale, sinon mémoire spécifique à cet
 * objectif (Goal Memory) — le matching d'une observation existante inclut
 * `goalId` pour qu'une mémoire globale et une mémoire scopée à un objectif,
 * même type et même contenu, ne fusionnent jamais entre elles.
 */
export async function applyMemoryObservations(userId: string, candidates: MemoryCandidate[], goalId: string | null) {
  for (const candidate of candidates) {
    const existing = await prisma.questMemory.findFirst({ where: { userId, goalId, type: candidate.type, content: candidate.content } });
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
          goalId: goalId ?? undefined,
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
