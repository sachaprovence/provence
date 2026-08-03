import "server-only";
import { prisma } from "@/lib/prisma";

/** Même précaution que `agents/observability.ts`/`workflows/dashboard-service.ts` : forcer un `number` JS ordinaire, `AVG()` pouvant renvoyer un `Prisma.Decimal`. */
function toPlainNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : Number(value);
}

/**
 * Tableau de bord d'observabilité du Knowledge Engine (v0.7, voir brief
 * "OBSERVABILITÉ") : nombre de documents (par statut/type de source),
 * embeddings (volume, cache, coût IA), index (temps moyen, succès/échec
 * par action), documents les plus utilisés (`KnowledgeDocument.usageCount`,
 * incrémenté par `searchKnowledge` — voir `search/usage.ts`).
 *
 * `responseQuality` est délibérément renvoyé comme indisponible : aucun
 * mécanisme de retour utilisateur (notation d'une réponse générée)
 * n'existe encore dans le produit — l'afficher comme un faux score serait
 * mensonger (même discipline que les stubs "non implémenté" des
 * fournisseurs, voir ADR 0025/0027). Voir ROADMAP.md pour ce prérequis.
 */
export async function getKnowledgeDashboard(workspaceId: string) {
  const [
    documentsByStatus,
    documentsBySourceType,
    mostUsedDocuments,
    chunkCount,
    indexLogsByActionAndSuccess,
    indexDurationAgg,
    embeddingAgg,
    embeddingByProviderAndCached,
  ] = await Promise.all([
    prisma.knowledgeDocument.groupBy({ by: ["status"], where: { workspaceId }, _count: { _all: true } }),
    prisma.knowledgeDocument.groupBy({ by: ["sourceType"], where: { workspaceId }, _count: { _all: true } }),
    prisma.knowledgeDocument.findMany({
      where: { workspaceId, usageCount: { gt: 0 } },
      orderBy: { usageCount: "desc" },
      take: 10,
      select: { id: true, title: true, sourceType: true, usageCount: true, lastUsedAt: true },
    }),
    prisma.knowledgeChunk.count({ where: { document: { workspaceId } } }),
    prisma.knowledgeIndexLog.groupBy({ by: ["action", "success"], where: { workspaceId }, _count: { _all: true } }),
    prisma.$queryRaw<{ avg_ms: number | null }[]>`
      SELECT AVG("durationMs")::float8 AS avg_ms
      FROM "KnowledgeIndexLog"
      WHERE "workspaceId" = ${workspaceId} AND "durationMs" IS NOT NULL
    `,
    prisma.embeddingRequest.aggregate({
      where: { workspaceId },
      _count: { _all: true },
      _sum: { inputCount: true, estimatedCostUsd: true },
    }),
    prisma.embeddingRequest.groupBy({ by: ["provider", "cached"], where: { workspaceId }, _count: { _all: true } }),
  ]);

  const documentCounts = Object.fromEntries(documentsByStatus.map((row) => [row.status, row._count._all])) as Partial<
    Record<string, number>
  >;
  const totalDocuments = documentsByStatus.reduce((sum, row) => sum + row._count._all, 0);
  const documentsBySourceTypeMap = Object.fromEntries(
    documentsBySourceType.map((row) => [row.sourceType, row._count._all])
  ) as Partial<Record<string, number>>;

  const indexingByAction: Record<string, { success: number; failed: number; total: number }> = {};
  for (const row of indexLogsByActionAndSuccess) {
    const bucket = indexingByAction[row.action] ?? { success: 0, failed: 0, total: 0 };
    if (row.success) bucket.success += row._count._all;
    else bucket.failed += row._count._all;
    bucket.total += row._count._all;
    indexingByAction[row.action] = bucket;
  }
  const totalIndexOperations = Object.values(indexingByAction).reduce((sum, b) => sum + b.total, 0);
  const totalIndexFailures = Object.values(indexingByAction).reduce((sum, b) => sum + b.failed, 0);

  const embeddingsByProvider: Record<string, { requests: number; cached: number }> = {};
  for (const row of embeddingByProviderAndCached) {
    const bucket = embeddingsByProvider[row.provider] ?? { requests: 0, cached: 0 };
    bucket.requests += row._count._all;
    if (row.cached) bucket.cached += row._count._all;
    embeddingsByProvider[row.provider] = bucket;
  }
  const totalEmbeddingRequests = embeddingAgg._count._all;
  const totalCachedEmbeddingRequests = Object.values(embeddingsByProvider).reduce((sum, b) => sum + b.cached, 0);

  return {
    documents: {
      total: totalDocuments,
      byStatus: documentCounts,
      bySourceType: documentsBySourceTypeMap,
    },
    chunks: { total: chunkCount },
    indexing: {
      byAction: indexingByAction,
      totalOperations: totalIndexOperations,
      totalFailures: totalIndexFailures,
      failureRate: totalIndexOperations > 0 ? totalIndexFailures / totalIndexOperations : null,
      averageDurationMs: toPlainNumberOrNull(indexDurationAgg[0]?.avg_ms),
    },
    embeddings: {
      totalRequests: totalEmbeddingRequests,
      totalTextsEmbedded: embeddingAgg._sum.inputCount ?? 0,
      cacheHitRate: totalEmbeddingRequests > 0 ? totalCachedEmbeddingRequests / totalEmbeddingRequests : null,
      estimatedCostUsd: embeddingAgg._sum.estimatedCostUsd ?? 0,
      byProvider: embeddingsByProvider,
    },
    mostUsedDocuments,
    responseQuality: {
      available: false,
      reason: "Aucun signal de retour utilisateur (notation d'une réponse IA) n'est encore collecté — voir ROADMAP.md.",
    },
  };
}
