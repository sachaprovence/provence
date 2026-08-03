import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { getActiveVectorStore } from "../vector-stores";
import type { SearchScope, SearchMatch } from "./types";

/**
 * "Plus proches voisins" d'un fragment déjà indexé — réutilise son
 * embedding déjà stocké plutôt que de le revectoriser. Nécessite que
 * `KnowledgeChunk.embedding` soit renseigné, ce qui n'est garanti que pour
 * la base vectorielle par défaut (`pgvector`) : une base externe
 * (Pinecone, Qdrant...) stocke le vecteur uniquement de son côté, pas dans
 * cette colonne — limite documentée, cohérente avec ADR 0025.
 */
export async function findSimilarChunks(chunkId: string, scope: SearchScope, limit: number = 10): Promise<SearchMatch[]> {
  const chunk = await prisma.knowledgeChunk.findFirst({
    where: { id: chunkId, document: { organizationId: scope.organizationId, workspaceId: scope.workspaceId } },
  });
  if (!chunk || chunk.embedding.length === 0) {
    throw new NotFoundError("Fragment introuvable ou non vectorisé dans la base par défaut.");
  }

  const matches = await getActiveVectorStore().query(chunk.embedding, {
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    documentIds: scope.documentIds,
    tags: scope.tags,
    topK: limit + 1, // +1 : le fragment de départ apparaît généralement dans ses propres résultats
  });

  return hydrate(matches.filter((m) => m.id !== chunkId).slice(0, limit));
}

async function hydrate(matches: { id: string; score: number }[]): Promise<SearchMatch[]> {
  if (matches.length === 0) return [];
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { id: { in: matches.map((m) => m.id) } },
    include: { document: { select: { title: true, sourceType: true, tags: true } } },
  });
  const byId = new Map(chunks.map((c) => [c.id, c]));

  return matches
    .map((m) => {
      const chunk = byId.get(m.id);
      if (!chunk) return null;
      const result: SearchMatch = {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        documentTitle: chunk.document.title,
        sourceType: chunk.document.sourceType,
        tags: chunk.document.tags,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        score: m.score,
      };
      return result;
    })
    .filter((m): m is SearchMatch => m !== null);
}
