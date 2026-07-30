import "server-only";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { NotFoundError, ConflictError, ValidationError } from "@/lib/errors";
import { assertGrantsWithinDeclaredCeiling } from "./permissions";
import { AgentDefinitionStatus, AgentInstallationStatus } from "@/generated/prisma/enums";
import type { WorkspaceActor } from "@/lib/workspace-context";

/**
 * Récupère une installation en la filtrant STRICTEMENT par l'organisation
 * de l'acteur courant — même principe que `resolveWorkspaceOrThrow` (v0.2,
 * ADR 0005) : jamais de confiance dans le seul id fourni par le client.
 */
export async function resolveInstallationOrThrow(actor: { organization: { id: string } }, installationId: string) {
  const installation = await prisma.agentInstallation.findFirst({
    where: { id: installationId, organizationId: actor.organization.id },
    include: { definition: true },
  });
  if (!installation) throw new NotFoundError("Agent introuvable.");
  return installation;
}

/** Catalogue disponible pour une organisation : agents globaux + agents propres à l'organisation. */
export async function listCatalog(actor: { organization: { id: string } }) {
  return prisma.agentDefinition.findMany({
    where: {
      OR: [{ organizationId: null }, { organizationId: actor.organization.id }],
      status: "PUBLISHED",
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export async function listInstallations(actor: WorkspaceActor) {
  return prisma.agentInstallation.findMany({
    where: { workspaceId: actor.workspace.id },
    include: { definition: true },
    orderBy: { installedAt: "asc" },
  });
}

export async function installAgent(
  actor: WorkspaceActor,
  params: { definitionId: string; config?: unknown; toolKeys?: string[]; permissions?: string[] }
) {
  const definition = await prisma.agentDefinition.findFirst({
    where: { id: params.definitionId, OR: [{ organizationId: null }, { organizationId: actor.organization.id }] },
  });
  if (!definition) throw new NotFoundError("Définition d'agent introuvable.");
  if (definition.status !== AgentDefinitionStatus.PUBLISHED) {
    // Empêche l'installation d'une définition DRAFT/DEPRECATED/ARCHIVED même
    // en connaissant son id directement — nécessaire depuis que des stubs
    // DRAFT existent en base pour les futurs agents métier (v0.4, voir
    // `src/lib/agents/director/capability-contracts.ts` et ADR 0012).
    throw new ValidationError("Cette définition d'agent n'est pas publiée et ne peut pas être installée.");
  }

  const existing = await prisma.agentInstallation.findUnique({
    where: { workspaceId_definitionId: { workspaceId: actor.workspace.id, definitionId: definition.id } },
  });
  if (existing) throw new ConflictError("Cet agent est déjà installé dans ce workspace.");

  const toolKeys = params.toolKeys ?? [];
  const permissions = params.permissions ?? [];
  assertGrantsWithinDeclaredCeiling({
    requestedToolKeys: toolKeys,
    requestedPermissions: permissions,
    declaredToolKeys: definition.declaredToolKeys,
    declaredPermissions: definition.declaredPermissions,
    actorWorkspaceRole: actor.workspace.role,
  });

  const installation = await prisma.agentInstallation.create({
    data: {
      organizationId: actor.organization.id,
      workspaceId: actor.workspace.id,
      definitionId: definition.id,
      config: (params.config ?? null) as never,
      grantedToolKeys: toolKeys,
      grantedPermissions: permissions,
      installedById: actor.user.id,
    },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "agent.installed",
    entityType: "AgentInstallation",
    entityId: installation.id,
    metadata: { definitionKey: definition.key, toolKeys, permissions },
  });

  return installation;
}

export async function updateInstallationGrants(
  actor: WorkspaceActor,
  installationId: string,
  params: { toolKeys: string[]; permissions: string[] }
) {
  const installation = await resolveInstallationOrThrow(actor, installationId);

  assertGrantsWithinDeclaredCeiling({
    requestedToolKeys: params.toolKeys,
    requestedPermissions: params.permissions,
    declaredToolKeys: installation.definition.declaredToolKeys,
    declaredPermissions: installation.definition.declaredPermissions,
    actorWorkspaceRole: actor.workspace.role,
  });

  const updated = await prisma.agentInstallation.update({
    where: { id: installationId },
    data: { grantedToolKeys: params.toolKeys, grantedPermissions: params.permissions },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "agent.grants_updated",
    entityType: "AgentInstallation",
    entityId: installationId,
    metadata: params,
  });

  return updated;
}

export async function updateInstallationConfig(actor: WorkspaceActor, installationId: string, config: unknown) {
  await resolveInstallationOrThrow(actor, installationId);
  const updated = await prisma.agentInstallation.update({
    where: { id: installationId },
    data: { config: config as never },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "agent.config_updated",
    entityType: "AgentInstallation",
    entityId: installationId,
  });

  return updated;
}

type LifecycleAction = "activate" | "deactivate" | "suspend" | "resume" | "uninstall";

const ALLOWED_TRANSITIONS: Record<LifecycleAction, AgentInstallationStatus[]> = {
  activate: [AgentInstallationStatus.INSTALLED, AgentInstallationStatus.INACTIVE, AgentInstallationStatus.SUSPENDED],
  deactivate: [AgentInstallationStatus.ACTIVE],
  suspend: [AgentInstallationStatus.ACTIVE],
  resume: [AgentInstallationStatus.SUSPENDED],
  uninstall: [
    AgentInstallationStatus.INSTALLED,
    AgentInstallationStatus.ACTIVE,
    AgentInstallationStatus.INACTIVE,
    AgentInstallationStatus.SUSPENDED,
  ],
};

const TARGET_STATUS: Record<LifecycleAction, AgentInstallationStatus> = {
  activate: AgentInstallationStatus.ACTIVE,
  deactivate: AgentInstallationStatus.INACTIVE,
  suspend: AgentInstallationStatus.SUSPENDED,
  resume: AgentInstallationStatus.ACTIVE,
  uninstall: AgentInstallationStatus.UNINSTALLED,
};

const AUDIT_ACTION: Record<LifecycleAction, string> = {
  activate: "agent.activated",
  deactivate: "agent.deactivated",
  suspend: "agent.suspended",
  resume: "agent.resumed",
  uninstall: "agent.uninstalled",
};

/**
 * Transition de cycle de vie d'une installation (installé, activé,
 * désactivé, suspendu, repris, désinstallé — le "démarré/arrêté/redémarré"
 * de la demande s'applique aux *exécutions* individuelles, voir
 * `execution-engine.ts`). Toute transition non autorisée depuis l'état
 * courant est refusée explicitement plutôt que silencieusement ignorée.
 */
export async function transitionInstallation(actor: WorkspaceActor, installationId: string, action: LifecycleAction) {
  const installation = await resolveInstallationOrThrow(actor, installationId);

  if (!ALLOWED_TRANSITIONS[action].includes(installation.status)) {
    throw new ValidationError(
      `Impossible d'appliquer "${action}" à un agent au statut "${installation.status}".`
    );
  }

  const updated = await prisma.agentInstallation.update({
    where: { id: installationId },
    data: {
      status: TARGET_STATUS[action],
      uninstalledAt: action === "uninstall" ? new Date() : undefined,
      suspendedAt: action === "suspend" ? new Date() : action === "resume" ? null : undefined,
    },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: AUDIT_ACTION[action],
    entityType: "AgentInstallation",
    entityId: installationId,
  });

  return updated;
}
