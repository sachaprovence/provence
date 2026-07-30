import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Journal d'usage documentaire ("documents les plus utilisés", voir
 * tableau de bord d'observabilité) : incrémenté une seule fois par appel à
 * `searchKnowledge` (le point d'entrée unique du Knowledge Engine — voir
 * `index.ts`), jamais par moteur individuel, pour ne jamais compter deux
 * fois un même document quand la recherche hybride combine plein texte et
 * vectoriel en interne.
 */
export async function recordDocumentUsage(documentIds: string[]): Promise<void> {
  const uniqueIds = Array.from(new Set(documentIds));
  if (uniqueIds.length === 0) return;
  await prisma.knowledgeDocument.updateMany({
    where: { id: { in: uniqueIds } },
    data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
  });
}
