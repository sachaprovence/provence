import "server-only";
import { prisma } from "@/lib/prisma";
import { embedTexts } from "../embeddings/embedding-service";
import { getActiveVectorStore } from "../vector-stores";
import type { SearchScope, SearchMatch } from "./types";

/**
 * Recherche vectorielle : vectorise la requête puis interroge la base
 * vectorielle active. Le résultat est ensuite ré-hydraté et **re-vérifié**
 * contre `scope` même si l'index externe a déjà filtré — jamais confiance
 * aveugle en un index tiers pour une décision d'autorisation (même
 * principe que les parseurs de sources DB, voir ADR 0026).
 */
export async function vectorSearch(query: string, scope: SearchScope, limit: number = 10): Promise<SearchMatch[]> {
  const embedding = await embedTexts({ organizationId: scope.organizationId, workspaceId: scope.workspaceId, texts: [query] });
  if (embedding.vectors.length === 0) return [];

  // Marge de sur-récupération : certaines bases externes ne savent pas filtrer par sourceType nativement, on filtre après coup.
  const overfetch = scope.sourceTypes ? limit * 4 : limit;
  const matches = await getActiveVectorStore().query(embedding.vectors[0], {
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    documentIds: scope.documentIds,
    tags: scope.tags,
    topK: overfetch,
  });

  return hydrateAndFilter(matches, scope, limit);
}

async function hydrateAndFilter(
  matches: { id: string; score: number }[],
  scope: SearchScope,
  limit: number
): Promise<SearchMatch[]> {
  if (matches.length === 0) return [];
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { id: { in: matches.map((m) => m.id) } },
    include: { document: { select: { title: true, sourceType: true, tags: true, organizationId: true, workspaceId: true } } },
  });
  const byId = new Map(chunks.map((c) => [c.id, c]));

  const results: SearchMatch[] = [];
  for (const match of matches) {
    const chunk = byId.get(match.id);
    if (!chunk) continue;
    if (chunk.document.organizationId !== scope.organizationId) continue;
    if (scope.workspaceId && chunk.document.workspaceId !== scope.workspaceId) continue;
    if (scope.sourceTypes && !scope.sourceTypes.includes(chunk.document.sourceType)) continue;

    results.push({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      documentTitle: chunk.document.title,
      sourceType: chunk.document.sourceType,
      tags: chunk.document.tags,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      score: match.score,
    });
    if (results.length >= limit) break;
  }
  return results;
}
