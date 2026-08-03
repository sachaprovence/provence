import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Statistiques d'observabilité du Memory Engine (v0.7) : répartition des
 * entrées par niveau (`MemoryScopeType`) et par nature (`MemoryKind`),
 * volume archivé, volume en attente de nettoyage (expiré mais pas encore
 * archivé par `clearExpiredMemoryEntries`) — complète le tableau de bord du
 * Knowledge Engine (`knowledge/dashboard-service.ts`) sans lui être
 * couplé : chaque moteur reste indépendant (voir brief v0.7).
 */
export async function getMemoryDashboard(organizationId: string) {
  const [byScopeType, byKind, totalCurrent, archivedCount, pendingCleanupCount, compressedCount] = await Promise.all([
    prisma.memoryEntry.groupBy({ by: ["scopeType"], where: { organizationId, isCurrent: true }, _count: { _all: true } }),
    prisma.memoryEntry.groupBy({ by: ["kind"], where: { organizationId, isCurrent: true }, _count: { _all: true } }),
    prisma.memoryEntry.count({ where: { organizationId, isCurrent: true } }),
    prisma.memoryEntry.count({ where: { organizationId, archivedAt: { not: null } } }),
    prisma.memoryEntry.count({ where: { organizationId, archivedAt: null, expiresAt: { lt: new Date() } } }),
    prisma.memoryEntry.count({ where: { organizationId, isCurrent: true, compressed: true } }),
  ]);

  return {
    totalCurrentEntries: totalCurrent,
    byScopeType: Object.fromEntries(byScopeType.map((row) => [row.scopeType, row._count._all])) as Partial<Record<string, number>>,
    byKind: Object.fromEntries(byKind.map((row) => [row.kind, row._count._all])) as Partial<Record<string, number>>,
    archivedCount,
    pendingCleanupCount,
    compressedCount,
  };
}
