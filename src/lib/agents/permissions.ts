import "server-only";
import { ForbiddenError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { hasWorkspacePermission, type WorkspacePermission } from "@/lib/workspace-permissions";
import type { WorkspaceRole } from "@/generated/prisma/enums";

/**
 * Permissions du Framework Agents (voir ADR 0007) : un agent ne peut
 * jamais utiliser un outil ou une permission de workspace qui ne lui a
 * pas été **explicitement accordée à l'installation** — jamais déduit de
 * ce que sa définition déclare pouvoir faire (`declaredToolKeys`/
 * `declaredPermissions` ne sont qu'un plafond, voir `installation-service.ts`).
 * Toute vérification se fait ici, jamais dans l'UI.
 */

export function installationHasTool(
  installation: { grantedToolKeys: string[] },
  toolKey: string
): boolean {
  return installation.grantedToolKeys.includes(toolKey);
}

export function installationHasPermission(
  installation: { grantedPermissions: string[] },
  permission: WorkspacePermission
): boolean {
  return installation.grantedPermissions.includes(permission);
}

/**
 * Vérifie qu'une installation est autorisée à utiliser un outil ;
 * journalise systématiquement un refus (`agent.tool_access_denied`) avant
 * de lever — même principe que `requireWorkspacePermission` (v0.2).
 */
export async function requireAgentToolPermission(
  installation: { id: string; organizationId: string; grantedToolKeys: string[] },
  toolKey: string
): Promise<void> {
  if (installationHasTool(installation, toolKey)) return;

  await writeAuditLog({
    organizationId: installation.organizationId,
    action: "agent.tool_access_denied",
    entityType: "AgentInstallation",
    entityId: installation.id,
    metadata: { toolKey },
  });
  throw new ForbiddenError(`Cet agent n'est pas autorisé à utiliser l'outil "${toolKey}".`);
}

/**
 * Vérifie qu'une installation est autorisée à exercer une permission de
 * workspace donnée (ex. un outil qui modifie des prospects doit vérifier
 * `MANAGE_LEADS`), en plus de la vérification du rôle de l'acteur humain
 * qui a installé/mis à jour l'agent (faite à l'installation, voir
 * `installation-service.ts`).
 */
export async function requireAgentWorkspacePermission(
  installation: { id: string; organizationId: string; grantedPermissions: string[] },
  permission: WorkspacePermission
): Promise<void> {
  if (installationHasPermission(installation, permission)) return;

  await writeAuditLog({
    organizationId: installation.organizationId,
    action: "agent.permission_access_denied",
    entityType: "AgentInstallation",
    entityId: installation.id,
    metadata: { permission },
  });
  throw new ForbiddenError(`Cet agent n'est pas autorisé à exercer la permission "${permission}".`);
}

/**
 * Un agent ne peut jamais se voir accorder plus que ce que sa définition
 * déclare pouvoir demander, ni plus que ce que l'humain qui l'installe
 * possède lui-même dans le workspace (principe de moindre privilège).
 */
export function assertGrantsWithinDeclaredCeiling(params: {
  requestedToolKeys: string[];
  requestedPermissions: string[];
  declaredToolKeys: string[];
  declaredPermissions: string[];
  actorWorkspaceRole: WorkspaceRole;
}): void {
  const excessTools = params.requestedToolKeys.filter((key) => !params.declaredToolKeys.includes(key));
  if (excessTools.length > 0) {
    throw new ForbiddenError(
      `Ces outils ne sont pas déclarés par la définition de l'agent : ${excessTools.join(", ")}.`
    );
  }

  const excessPermissions = params.requestedPermissions.filter(
    (permission) => !params.declaredPermissions.includes(permission)
  );
  if (excessPermissions.length > 0) {
    throw new ForbiddenError(
      `Ces permissions ne sont pas déclarées par la définition de l'agent : ${excessPermissions.join(", ")}.`
    );
  }

  const beyondActorRole = params.requestedPermissions.filter(
    (permission) => !hasWorkspacePermission(params.actorWorkspaceRole, permission as WorkspacePermission)
  );
  if (beyondActorRole.length > 0) {
    throw new ForbiddenError(
      `Vous ne pouvez pas accorder à un agent une permission que vous ne possédez pas vous-même : ${beyondActorRole.join(", ")}.`
    );
  }
}
