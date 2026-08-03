import "server-only";
import type { AgentInstallation } from "@/generated/prisma/client";
import { AgentMemoryScope } from "@/generated/prisma/enums";
import { setMemory, getMemory } from "@/lib/agents/memory";

/**
 * Mémoire commerciale qualitative (préférences, objections) — construite
 * sur `setMemory`/`getMemory` (v0.3, portée PERSISTENT), comme la mémoire
 * du Director (v0.4). Le reste de la "mémoire commerciale" demandée
 * (historique, réponses, résultats, emails envoyés, devis) est déjà
 * structuré et interrogeable directement via `CommercialProspect`/
 * `CommercialAction` — inutile de le dupliquer ici. Clé mémoire scopée par
 * prospect (`commercial.prospect.<id>.*`) au sein du workspace.
 */
type InstallationRef = Pick<AgentInstallation, "id" | "workspaceId">;

const MAX_OBJECTIONS = 20;

function preferencesKey(prospectId: string) {
  return `commercial.prospect.${prospectId}.preferences`;
}

function objectionsKey(prospectId: string) {
  return `commercial.prospect.${prospectId}.objections`;
}

export async function recordPreference(installation: InstallationRef, prospectId: string, key: string, value: unknown) {
  const existing = await getMemory({
    workspaceId: installation.workspaceId,
    installationId: installation.id,
    scope: AgentMemoryScope.PERSISTENT,
    key: preferencesKey(prospectId),
  });
  const current = (existing?.value as Record<string, unknown> | undefined) ?? {};
  const next = { ...current, [key]: value };

  await setMemory({
    workspaceId: installation.workspaceId,
    installationId: installation.id,
    scope: AgentMemoryScope.PERSISTENT,
    key: preferencesKey(prospectId),
    value: next,
  });
  return next;
}

export async function getPreferences(installation: InstallationRef, prospectId: string): Promise<Record<string, unknown>> {
  const entry = await getMemory({
    workspaceId: installation.workspaceId,
    installationId: installation.id,
    scope: AgentMemoryScope.PERSISTENT,
    key: preferencesKey(prospectId),
  });
  return (entry?.value as Record<string, unknown> | undefined) ?? {};
}

export type ObjectionRecord = { objection: string; at: string };

export async function recordObjection(installation: InstallationRef, prospectId: string, objection: string) {
  const existing = await getMemory({
    workspaceId: installation.workspaceId,
    installationId: installation.id,
    scope: AgentMemoryScope.PERSISTENT,
    key: objectionsKey(prospectId),
  });
  const list = Array.isArray(existing?.value) ? (existing.value as ObjectionRecord[]) : [];
  const next = [...list, { objection, at: new Date().toISOString() }].slice(-MAX_OBJECTIONS);

  await setMemory({
    workspaceId: installation.workspaceId,
    installationId: installation.id,
    scope: AgentMemoryScope.PERSISTENT,
    key: objectionsKey(prospectId),
    value: next,
  });
  return next;
}

export async function listObjections(installation: InstallationRef, prospectId: string): Promise<ObjectionRecord[]> {
  const entry = await getMemory({
    workspaceId: installation.workspaceId,
    installationId: installation.id,
    scope: AgentMemoryScope.PERSISTENT,
    key: objectionsKey(prospectId),
  });
  return Array.isArray(entry?.value) ? (entry.value as ObjectionRecord[]) : [];
}
