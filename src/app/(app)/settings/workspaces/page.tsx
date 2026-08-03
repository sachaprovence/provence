import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { listWorkspacesForOrganization } from "@/lib/workspace-service";
import { WorkspacesClient } from "@/components/workspaces-client";

export default async function WorkspacesPage() {
  const actor = await requireWorkspaceActor();

  if (!hasWorkspacePermission(actor.workspace.role, "MANAGE_WORKSPACE")) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-p360-danger">
          Vous n&apos;avez pas la permission de gérer les workspaces de cette organisation.
        </p>
      </div>
    );
  }

  const workspaces = await listWorkspacesForOrganization(actor);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Workspaces</h1>
      <p className="text-sm text-p360-muted">
        Chaque workspace est un sous-espace de travail au sein de l&apos;organisation{" "}
        <strong>{actor.organization.name}</strong>.
      </p>
      <WorkspacesClient
        workspaces={workspaces.map((w) => ({
          id: w.id,
          name: w.name,
          slug: w.slug,
          description: w.description,
          isDefault: w.isDefault,
          archivedAt: w.archivedAt ? w.archivedAt.toISOString() : null,
        }))}
      />
    </div>
  );
}
