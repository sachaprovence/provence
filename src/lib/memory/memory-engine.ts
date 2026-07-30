import "server-only";
import { prisma } from "@/lib/prisma";
import { getActiveLlmProvider } from "@/lib/agents/llm";
import { MemoryScopeType, MemoryKind } from "@/generated/prisma/enums";

/**
 * Memory Engine (v0.7) : mémoire générique multi-niveaux — utilisateur,
 * organisation, workspace, agent, workflow, conversation, tâche
 * (`MemoryScopeType`), croisée avec une nature (`MemoryKind` : long terme,
 * temporaire, décisionnelle, documentaire, préférences). Seul point
 * d'écriture (`setMemoryEntry`, comme `agents/memory.ts#setMemory` l'est
 * pour la mémoire d'agent v0.3, qui reste distincte — voir ADR 0023).
 * Chaque écriture crée une nouvelle version (jamais de modification en
 * place, même principe que `PromptTemplate`) : l'historique complet reste
 * consultable via `getMemoryHistory`.
 */

export type MemoryScopeRef = { scopeType: MemoryScopeType; scopeId: string; kind: MemoryKind; key: string };

/** Politique de TTL par défaut, par nature de mémoire — configurable au cas par cas via `ttlMs` explicite à l'écriture. */
const DEFAULT_TTL_MS_BY_KIND: Partial<Record<MemoryKind, number>> = {
  TEMPORARY: 60 * 60 * 1000, // 1 heure
};

/** Durée de rétention d'une entrée archivée avant purge définitive (voir `purgeArchivedMemoryEntries`). */
const DEFAULT_ARCHIVE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

function defaultTtlMsFor(kind: MemoryKind): number | undefined {
  return DEFAULT_TTL_MS_BY_KIND[kind];
}

export async function setMemoryEntry(
  ref: MemoryScopeRef & {
    organizationId: string;
    workspaceId?: string;
    value: unknown;
    ttlMs?: number;
    createdById?: string;
  }
) {
  const ttlMs = ref.ttlMs ?? defaultTtlMsFor(ref.kind);
  const expiresAt = ttlMs ? new Date(Date.now() + ttlMs) : null;

  const last = await prisma.memoryEntry.findFirst({
    where: {
      organizationId: ref.organizationId,
      scopeType: ref.scopeType,
      scopeId: ref.scopeId,
      kind: ref.kind,
      key: ref.key,
    },
    orderBy: { version: "desc" },
  });
  const nextVersion = (last?.version ?? 0) + 1;

  return prisma.$transaction(async (tx) => {
    if (last?.isCurrent) {
      await tx.memoryEntry.update({ where: { id: last.id }, data: { isCurrent: false } });
    }
    return tx.memoryEntry.create({
      data: {
        organizationId: ref.organizationId,
        workspaceId: ref.workspaceId,
        scopeType: ref.scopeType,
        scopeId: ref.scopeId,
        kind: ref.kind,
        key: ref.key,
        version: nextVersion,
        isCurrent: true,
        value: ref.value as never,
        ttlMs,
        expiresAt,
        createdById: ref.createdById,
      },
    });
  });
}

/** Renvoie la version courante, ou `null` si absente, expirée ou archivée. */
export async function getMemoryEntry(organizationId: string, ref: MemoryScopeRef) {
  const entry = await prisma.memoryEntry.findFirst({
    where: {
      organizationId,
      scopeType: ref.scopeType,
      scopeId: ref.scopeId,
      kind: ref.kind,
      key: ref.key,
      isCurrent: true,
    },
  });
  if (!entry) return null;
  if (entry.archivedAt) return null;
  if (entry.expiresAt && entry.expiresAt < new Date()) return null;
  return entry;
}

export async function listMemoryEntries(params: {
  organizationId: string;
  scopeType?: MemoryScopeType;
  scopeId?: string;
  kind?: MemoryKind;
  includeArchived?: boolean;
}) {
  return prisma.memoryEntry.findMany({
    where: {
      organizationId: params.organizationId,
      scopeType: params.scopeType,
      scopeId: params.scopeId,
      kind: params.kind,
      isCurrent: true,
      archivedAt: params.includeArchived ? undefined : null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { updatedAt: "desc" },
  });
}

/** Historique complet (toutes les versions) d'une entrée précise. */
export async function getMemoryHistory(organizationId: string, ref: MemoryScopeRef) {
  return prisma.memoryEntry.findMany({
    where: { organizationId, scopeType: ref.scopeType, scopeId: ref.scopeId, kind: ref.kind, key: ref.key },
    orderBy: { version: "desc" },
  });
}

export async function archiveMemoryEntry(id: string) {
  return prisma.memoryEntry.update({ where: { id }, data: { archivedAt: new Date() } });
}

/** Marque comme archivées (jamais supprimées immédiatement) les entrées dont le TTL est dépassé — le "nettoyage" réel est `purgeArchivedMemoryEntries`. */
export async function clearExpiredMemoryEntries(now: Date = new Date()) {
  const result = await prisma.memoryEntry.updateMany({
    where: { expiresAt: { lt: now }, archivedAt: null },
    data: { archivedAt: now },
  });
  return result.count;
}

/** Purge définitivement les entrées archivées depuis plus de `retentionMs` (nettoyage réel, irréversible). */
export async function purgeArchivedMemoryEntries(retentionMs: number = DEFAULT_ARCHIVE_RETENTION_MS, now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - retentionMs);
  const result = await prisma.memoryEntry.deleteMany({ where: { archivedAt: { lt: cutoff } } });
  return result.count;
}

const COMPRESSION_THRESHOLD_CHARS = 2000;

/**
 * Résumé automatique (réutilise le moteur LLM générique, v0.5 — jamais un
 * second moteur de génération) : au-delà d'un seuil de taille, produit un
 * résumé fidèle stocké dans `summary`/`compressed`, sans jamais modifier
 * `value` (la donnée brute reste consultable). Sans effet si l'entrée est
 * déjà en dessous du seuil.
 */
export async function compressMemoryEntry(id: string) {
  const entry = await prisma.memoryEntry.findUniqueOrThrow({ where: { id } });
  const raw = JSON.stringify(entry.value);
  if (raw.length < COMPRESSION_THRESHOLD_CHARS) return entry;

  const provider = getActiveLlmProvider();
  const result = await provider.complete({
    messages: [
      {
        role: "system",
        content: "Résume fidèlement le contenu suivant en quelques phrases, en conservant les faits et décisions clés.",
      },
      { role: "user", content: raw.slice(0, 8000) },
    ],
  });

  return prisma.memoryEntry.update({ where: { id }, data: { summary: result.text, compressed: true } });
}
