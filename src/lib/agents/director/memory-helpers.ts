import "server-only";
import type { AgentInstallation } from "@/generated/prisma/client";
import { AgentMemoryScope } from "@/generated/prisma/enums";
import { setMemory, getMemory } from "@/lib/agents/memory";

/**
 * Mémoire du Director — construite entièrement sur `setMemory`/`getMemory`
 * (v0.3, `AgentMemoryEntry` à portée PERSISTENT), sans nouvelle table : le
 * Director est un agent comme les autres, sa mémoire n'est pas un système
 * séparé. Chaque entrée est une liste plafonnée (évite une croissance non
 * bornée) stockée sous une clé dédiée. Le champ `embedding` réservé par
 * `AgentMemoryEntry` (v0.3, ADR 0009) est le point d'extension naturel pour
 * une future vectorisation de ces mêmes entrées — aucun fournisseur externe
 * n'est intégré à ce stade (voir ADR 0009, toujours en vigueur).
 */

const MEMORY_KEYS = {
  conversation: "director.conversation",
  decisions: "director.decisions",
  preferences: "director.preferences",
  context: "director.context",
  runSummaries: "director.run_summaries",
} as const;

const MAX_CONVERSATION_TURNS = 50;
const MAX_DECISIONS = 100;
const MAX_RUN_SUMMARIES = 20;

export type ConversationTurn = { role: "user" | "director"; content: string; at: string };
export type DecisionRecord = { decision: string; reasoning?: string; at: string };
export type RunSummary = {
  runId: string;
  planId: string;
  goal: string;
  status: string;
  succeededSteps: number;
  failedSteps: number;
  at: string;
};

async function appendCapped<T>(
  installation: Pick<AgentInstallation, "workspaceId" | "id">,
  key: string,
  entry: T,
  maxItems: number
): Promise<T[]> {
  const existing = await getMemory({
    workspaceId: installation.workspaceId,
    installationId: installation.id,
    scope: AgentMemoryScope.PERSISTENT,
    key,
  });
  const list = Array.isArray(existing?.value) ? (existing.value as T[]) : [];
  const next = [...list, entry].slice(-maxItems);

  await setMemory({
    workspaceId: installation.workspaceId,
    installationId: installation.id,
    scope: AgentMemoryScope.PERSISTENT,
    key,
    value: next,
  });

  return next;
}

export async function recordConversationTurn(
  installation: Pick<AgentInstallation, "workspaceId" | "id">,
  turn: Omit<ConversationTurn, "at">
) {
  return appendCapped<ConversationTurn>(
    installation,
    MEMORY_KEYS.conversation,
    { ...turn, at: new Date().toISOString() },
    MAX_CONVERSATION_TURNS
  );
}

export async function listConversation(
  installation: Pick<AgentInstallation, "workspaceId" | "id">
): Promise<ConversationTurn[]> {
  const entry = await getMemory({
    workspaceId: installation.workspaceId,
    installationId: installation.id,
    scope: AgentMemoryScope.PERSISTENT,
    key: MEMORY_KEYS.conversation,
  });
  return Array.isArray(entry?.value) ? (entry.value as ConversationTurn[]) : [];
}

export async function recordDecision(
  installation: Pick<AgentInstallation, "workspaceId" | "id">,
  decision: Omit<DecisionRecord, "at">
) {
  return appendCapped<DecisionRecord>(
    installation,
    MEMORY_KEYS.decisions,
    { ...decision, at: new Date().toISOString() },
    MAX_DECISIONS
  );
}

export async function listDecisions(
  installation: Pick<AgentInstallation, "workspaceId" | "id">
): Promise<DecisionRecord[]> {
  const entry = await getMemory({
    workspaceId: installation.workspaceId,
    installationId: installation.id,
    scope: AgentMemoryScope.PERSISTENT,
    key: MEMORY_KEYS.decisions,
  });
  return Array.isArray(entry?.value) ? (entry.value as DecisionRecord[]) : [];
}

export async function recordRunSummary(
  installation: Pick<AgentInstallation, "workspaceId" | "id">,
  summary: Omit<RunSummary, "at">
) {
  return appendCapped<RunSummary>(
    installation,
    MEMORY_KEYS.runSummaries,
    { ...summary, at: new Date().toISOString() },
    MAX_RUN_SUMMARIES
  );
}

export async function listRunSummaries(
  installation: Pick<AgentInstallation, "workspaceId" | "id">
): Promise<RunSummary[]> {
  const entry = await getMemory({
    workspaceId: installation.workspaceId,
    installationId: installation.id,
    scope: AgentMemoryScope.PERSISTENT,
    key: MEMORY_KEYS.runSummaries,
  });
  return Array.isArray(entry?.value) ? (entry.value as RunSummary[]) : [];
}

/** Préférences utilisateur cumulées (fusionnées, pas remplacées) — ex. ton préféré, agents favoris. */
export async function recordUserPreference(
  installation: Pick<AgentInstallation, "workspaceId" | "id">,
  key: string,
  value: unknown
) {
  const existing = await getMemory({
    workspaceId: installation.workspaceId,
    installationId: installation.id,
    scope: AgentMemoryScope.PERSISTENT,
    key: MEMORY_KEYS.preferences,
  });
  const current = (existing?.value as Record<string, unknown> | undefined) ?? {};
  const next = { ...current, [key]: value };

  await setMemory({
    workspaceId: installation.workspaceId,
    installationId: installation.id,
    scope: AgentMemoryScope.PERSISTENT,
    key: MEMORY_KEYS.preferences,
    value: next,
  });

  return next;
}

export async function getPreferences(
  installation: Pick<AgentInstallation, "workspaceId" | "id">
): Promise<Record<string, unknown>> {
  const entry = await getMemory({
    workspaceId: installation.workspaceId,
    installationId: installation.id,
    scope: AgentMemoryScope.PERSISTENT,
    key: MEMORY_KEYS.preferences,
  });
  return (entry?.value as Record<string, unknown> | undefined) ?? {};
}

/** Contexte de travail courant (dernier objectif, dernier plan actif, etc.) — remplacé à chaque écriture, pas cumulé. */
export async function setWorkingContext(installation: Pick<AgentInstallation, "workspaceId" | "id">, context: unknown) {
  return setMemory({
    workspaceId: installation.workspaceId,
    installationId: installation.id,
    scope: AgentMemoryScope.PERSISTENT,
    key: MEMORY_KEYS.context,
    value: context,
  });
}

export async function getWorkingContext(installation: Pick<AgentInstallation, "workspaceId" | "id">): Promise<unknown> {
  const entry = await getMemory({
    workspaceId: installation.workspaceId,
    installationId: installation.id,
    scope: AgentMemoryScope.PERSISTENT,
    key: MEMORY_KEYS.context,
  });
  return entry?.value ?? null;
}
