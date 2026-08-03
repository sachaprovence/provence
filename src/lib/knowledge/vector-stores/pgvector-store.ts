import "server-only";
import { prisma } from "@/lib/prisma";
import type { VectorStore, VectorRecord, VectorQueryOptions, VectorQueryMatch } from "./types";

/**
 * Base vectorielle par défaut : stocke directement dans `KnowledgeChunk.embedding`
 * (Postgres natif) plutôt que dans l'extension `pgvector` — **aucune
 * extension `vector` n'est disponible dans cet environnement**
 * (`SELECT * FROM pg_available_extensions WHERE name='vector'` ne
 * renvoie rien), voir ADR 0025. La similarité cosinus est calculée côté
 * application après un filtrage SQL par organisation/workspace/document/
 * tag — un balayage complet des candidats filtrés (`O(n)`, pas d'index
 * approximatif), documenté comme limite de performance assumée pour
 * cette phase de fondation, pas une hyperscale. `upsert` est le seul
 * point d'écriture de l'embedding d'un chunk.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class PgVectorStore implements VectorStore {
  readonly key = "pgvector";

  async upsert(records: VectorRecord[]): Promise<void> {
    for (const record of records) {
      await prisma.knowledgeChunk.update({ where: { id: record.id }, data: { embedding: record.vector } });
    }
  }

  async delete(ids: string[]): Promise<void> {
    await prisma.knowledgeChunk.updateMany({ where: { id: { in: ids } }, data: { embedding: [] } });
  }

  async query(vector: number[], options: VectorQueryOptions): Promise<VectorQueryMatch[]> {
    const candidates = await prisma.knowledgeChunk.findMany({
      where: {
        document: {
          organizationId: options.organizationId,
          workspaceId: options.workspaceId,
          id: options.documentIds ? { in: options.documentIds } : undefined,
          tags: options.tags ? { hasSome: options.tags } : undefined,
        },
        embedding: { isEmpty: false },
      },
      include: { document: { select: { id: true, title: true, sourceType: true, tags: true } } },
    });

    return candidates
      .map((chunk) => ({
        id: chunk.id,
        score: cosineSimilarity(vector, chunk.embedding),
        metadata: {
          documentId: chunk.documentId,
          documentTitle: chunk.document.title,
          sourceType: chunk.document.sourceType,
          tags: chunk.document.tags,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
        },
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, options.topK);
  }
}
