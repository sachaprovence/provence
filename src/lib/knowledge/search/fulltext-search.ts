import "server-only";
import { prisma } from "@/lib/prisma";
import type { SearchScope, SearchMatch } from "./types";

/**
 * Recherche plein texte, sans dépendance ni colonne `tsvector`/index GIN
 * (aucun des deux n'existe dans ce schéma) : filtre en SQL la présence de
 * chaque mot de la requête (insensible à la casse), puis classe par
 * fréquence totale d'occurrence — limite de performance assumée pour
 * cette phase de fondation, même logique que le calcul de similarité
 * cosinus côté application de `PgVectorStore` (voir ADR 0025).
 */
const CANDIDATE_LIMIT = 500;

function tokenize(query: string): string[] {
  return Array.from(new Set(query.toLowerCase().split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 1)));
}

function scoreContent(content: string, words: string[]): number {
  const lower = content.toLowerCase();
  return words.reduce((sum, word) => sum + (lower.split(word).length - 1), 0);
}

export async function fulltextSearch(query: string, scope: SearchScope, limit: number = 10): Promise<SearchMatch[]> {
  const words = tokenize(query);
  if (words.length === 0) return [];

  const chunks = await prisma.knowledgeChunk.findMany({
    where: {
      OR: words.map((word) => ({ content: { contains: word, mode: "insensitive" as const } })),
      document: {
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        sourceType: scope.sourceTypes ? { in: scope.sourceTypes } : undefined,
        id: scope.documentIds ? { in: scope.documentIds } : undefined,
        tags: scope.tags ? { hasSome: scope.tags } : undefined,
      },
    },
    include: { document: { select: { title: true, sourceType: true, tags: true } } },
    take: CANDIDATE_LIMIT,
  });

  return chunks
    .map((chunk) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      documentTitle: chunk.document.title,
      sourceType: chunk.document.sourceType,
      tags: chunk.document.tags,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      score: scoreContent(chunk.content, words),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
