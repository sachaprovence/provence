import "server-only";
import { prisma } from "@/lib/prisma";
import { AgentMemoryScope } from "@/generated/prisma/enums";
import { ValidationError } from "@/lib/errors";

/**
 * Mémoire d'agent à trois portées (voir ADR 0009). `setMemory` est le
 * **seul** point d'écriture — il garantit lui-même l'unicité par
 * (portée, clé), qu'une contrainte SQL ne peut pas exprimer proprement
 * pour la portée SHARED (voir le commentaire sur `AgentMemoryEntry` dans
 * `prisma/schema.prisma`).
 *
 * Conventions de clé (non contraintes par le schéma, pour rester adaptable
 * à des centaines d'agents) : `"context"` (contexte courant),
 * `"summary"` (résumé), `"history:<n>"` (un tour d'historique numéroté).
 */

function scopeRequiresInstallation(scope: AgentMemoryScope) {
  return scope === AgentMemoryScope.SHORT_TERM || scope === AgentMemoryScope.PERSISTENT;
}

export async function setMemory(params: {
  workspaceId: string;
  installationId: string | null;
  scope: AgentMemoryScope;
  key: string;
  value: unknown;
  ttlMs?: number;
}) {
  if (scopeRequiresInstallation(params.scope) && !params.installationId) {
    throw new ValidationError("Une mémoire SHORT_TERM/PERSISTENT doit être rattachée à une installation.");
  }
  if (params.scope === AgentMemoryScope.SHARED && params.installationId) {
    throw new ValidationError("La mémoire SHARED est partagée au niveau du workspace, pas d'une installation.");
  }

  const expiresAt = params.ttlMs ? new Date(Date.now() + params.ttlMs) : null;

  const existing = await prisma.agentMemoryEntry.findFirst({
    where: {
      workspaceId: params.workspaceId,
      installationId: params.installationId,
      scope: params.scope,
      key: params.key,
    },
  });

  if (existing) {
    return prisma.agentMemoryEntry.update({
      where: { id: existing.id },
      data: { value: params.value as never, expiresAt },
    });
  }

  return prisma.agentMemoryEntry.create({
    data: {
      workspaceId: params.workspaceId,
      installationId: params.installationId,
      scope: params.scope,
      key: params.key,
      value: params.value as never,
      expiresAt,
    },
  });
}

export async function getMemory(params: {
  workspaceId: string;
  installationId: string | null;
  scope: AgentMemoryScope;
  key: string;
}) {
  const entry = await prisma.agentMemoryEntry.findFirst({
    where: {
      workspaceId: params.workspaceId,
      installationId: params.installationId,
      scope: params.scope,
      key: params.key,
    },
  });
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt < new Date()) return null;
  return entry;
}

export async function listMemory(params: { workspaceId: string; installationId: string | null; scope?: AgentMemoryScope }) {
  return prisma.agentMemoryEntry.findMany({
    where: {
      workspaceId: params.workspaceId,
      installationId: params.installationId,
      scope: params.scope,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { updatedAt: "desc" },
  });
}

/** Purge les entrées de mémoire temporaire expirées — à appeler périodiquement (voir cron des agents). */
export async function clearExpiredMemory(now: Date = new Date()) {
  const result = await prisma.agentMemoryEntry.deleteMany({ where: { expiresAt: { lt: now } } });
  return result.count;
}
