import { notFound } from "next/navigation";
import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission, WORKSPACE_ROLE_LABELS } from "@/lib/workspace-permissions";
import { resolveWorkspaceOrThrow, listWorkspaceMembers } from "@/lib/workspace-service";
import { NotFoundError } from "@/lib/errors";
import { WorkspaceMembersClient } from "@/components/workspace-members-client";
import { WorkspaceRole } from "@/generated/prisma/enums";

export default async function WorkspaceMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActor();
  const { id } = await params;

  if (!hasWorkspacePermission(actor.workspace.role, "MANAGE_MEMBERS")) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-p360-danger">Vous n&apos;avez pas la permission de gérer les membres de ce workspace.</p>
      </div>
    );
  }

  // `id` provient de l'URL : `resolveWorkspaceOrThrow` revérifie qu'il
  // appartient bien à l'organisation de l'acteur courant (voir ADR 0005).
  let workspace;
  try {
    workspace = await resolveWorkspaceOrThrow(actor, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const memberships = await listWorkspaceMembers(actor, id);

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Membres — {workspace.name}</h1>
      <WorkspaceMembersClient
        workspaceId={id}
        currentUserId={actor.user.id}
        roles={Object.values(WorkspaceRole).map((role) => ({ value: role, label: WORKSPACE_ROLE_LABELS[role] }))}
        members={memberships.map((m) => ({
          membershipId: m.id,
          userId: m.user.id,
          name: `${m.user.firstName} ${m.user.lastName}`,
          email: m.user.email,
          role: m.role,
        }))}
      />
    </div>
  );
}
