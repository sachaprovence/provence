import "server-only";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentActor, type CurrentActor } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { ForbiddenError } from "@/lib/errors";
import {
  hasWorkspacePermission,
  WORKSPACE_AUDIT_ACTIONS,
  type WorkspacePermission,
} from "@/lib/workspace-permissions";
import type { WorkspaceRole } from "@/generated/prisma/enums";

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  isDefault: boolean;
};

export type WorkspaceActor = CurrentActor & {
  workspace: WorkspaceSummary;
  availableWorkspaces: WorkspaceSummary[];
};

/**
 * Workspaces réellement accessibles à l'acteur : jointure
 * `WorkspaceMembership` -> `Workspace`, **toujours** refiltrée par
 * l'organisation de l'acteur courant (défense en profondeur — une
 * `WorkspaceMembership` ne devrait jamais pointer vers un workspace d'une
 * autre organisation, mais on ne fait confiance à aucune donnée sans
 * revérification explicite ici). Les workspaces archivés sont exclus.
 */
async function listAvailableWorkspaces(actor: CurrentActor): Promise<WorkspaceSummary[]> {
  const memberships = await prisma.workspaceMembership.findMany({
    where: {
      userId: actor.user.id,
      workspace: { organizationId: actor.organization.id, archivedAt: null },
    },
    include: { workspace: true },
    orderBy: { workspace: { createdAt: "asc" } },
  });

  return memberships.map((membership) => ({
    id: membership.workspace.id,
    name: membership.workspace.name,
    slug: membership.workspace.slug,
    role: membership.role,
    isDefault: membership.workspace.isDefault,
  }));
}

/**
 * Résout l'acteur courant **et** son contexte de workspace actif. Ne fait
 * jamais confiance à un `workspaceId` transmis par le client : le workspace
 * actif est relu depuis `Session.activeWorkspaceId` (stocké côté serveur),
 * puis validé contre la liste réelle des workspaces accessibles — s'il ne
 * correspond plus à rien (archivé, accès retiré depuis), on retombe
 * silencieusement sur le workspace par défaut de l'organisation.
 */
export async function getCurrentWorkspaceActor(): Promise<WorkspaceActor | null> {
  const actor = await getCurrentActor();
  if (!actor) return null;

  const availableWorkspaces = await listAvailableWorkspaces(actor);
  if (availableWorkspaces.length === 0) return null;

  const session = await prisma.session.findUnique({
    where: { id: actor.sessionId },
    select: { activeWorkspaceId: true },
  });

  const active =
    availableWorkspaces.find((workspace) => workspace.id === session?.activeWorkspaceId) ??
    availableWorkspaces.find((workspace) => workspace.isDefault) ??
    availableWorkspaces[0];

  return { ...actor, workspace: active, availableWorkspaces };
}

/** Variante Server Component : redirige vers `/login` si aucun contexte valide. */
export async function requireWorkspaceActor(): Promise<WorkspaceActor> {
  const actor = await getCurrentWorkspaceActor();
  if (!actor) redirect("/login");
  return actor;
}

/** Variante Route Handler : renvoie une réponse 401 plutôt que de rediriger. */
export async function requireWorkspaceActorApi(): Promise<WorkspaceActor | NextResponse> {
  const actor = await getCurrentWorkspaceActor();
  if (!actor) {
    return NextResponse.json({ error: "Non authentifié ou aucun workspace accessible." }, { status: 401 });
  }
  return actor;
}

export function isWorkspaceActorResponse(value: WorkspaceActor | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

/**
 * Change le workspace actif de la session en cours. Revérifie
 * systématiquement, côté serveur, que l'acteur possède une
 * `WorkspaceMembership` active pour ce workspace avant d'écrire quoi que ce
 * soit — un `workspaceId` reçu d'une requête cliente n'est jamais utilisé
 * tel quel (voir ADR 0005, contrainte "aucune confiance dans un
 * organizationId/workspaceId envoyé par le client").
 */
export async function setActiveWorkspace(actor: CurrentActor, workspaceId: string): Promise<WorkspaceSummary> {
  const membership = await prisma.workspaceMembership.findFirst({
    where: {
      userId: actor.user.id,
      workspaceId,
      workspace: { organizationId: actor.organization.id, archivedAt: null },
    },
    include: { workspace: true },
  });

  if (!membership) {
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: WORKSPACE_AUDIT_ACTIONS.ACCESS_DENIED,
      entityType: "Workspace",
      entityId: workspaceId,
      metadata: { reason: "not_a_member_or_archived", attemptedWorkspaceId: workspaceId },
    });
    throw new ForbiddenError("Vous n'avez pas accès à ce workspace.");
  }

  await prisma.session.update({
    where: { id: actor.sessionId },
    data: { activeWorkspaceId: workspaceId },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: WORKSPACE_AUDIT_ACTIONS.ACTIVE_WORKSPACE_CHANGED,
    entityType: "Workspace",
    entityId: workspaceId,
  });

  return {
    id: membership.workspace.id,
    name: membership.workspace.name,
    slug: membership.workspace.slug,
    role: membership.role,
    isDefault: membership.workspace.isDefault,
  };
}

/**
 * Porte de contrôle serveur pour toute action sensible sur un workspace.
 * Journalise systématiquement un refus (`access.denied`) avant de lever —
 * jamais de contrôle laissé à la seule interface (voir contrainte "ne
 * simule aucune isolation seulement côté interface").
 */
export async function requireWorkspacePermission(
  actor: WorkspaceActor,
  permission: WorkspacePermission
): Promise<void> {
  if (hasWorkspacePermission(actor.workspace.role, permission)) return;

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: WORKSPACE_AUDIT_ACTIONS.ACCESS_DENIED,
    entityType: "Workspace",
    entityId: actor.workspace.id,
    metadata: { permission, role: actor.workspace.role },
  });
  throw new ForbiddenError(`Permission refusée : ${permission}.`);
}
