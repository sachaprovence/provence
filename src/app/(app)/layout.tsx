import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { SidebarNav } from "@/components/sidebar-nav";
import { LogoutButton } from "@/components/logout-button";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { CommandPalette } from "@/components/command-palette";
import { CommandPaletteTrigger } from "@/components/command-palette-trigger";

const ROLE_LABEL: Record<string, string> = {
  OWNER_ADMIN: "Administrateur",
  SALES: "Commercial",
  PROVIDER: "Prestataire régional",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireWorkspaceActor();

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 shrink-0 border-r border-p360-lavender-light bg-white flex flex-col">
        <div className="px-5 py-5 border-b border-p360-lavender-light">
          <div className="text-lg font-semibold text-p360-blue">Provence 360</div>
          <div className="text-xs text-p360-muted mt-0.5">{actor.organization.name}</div>
        </div>
        <div className="px-5 py-4 border-b border-p360-lavender-light">
          <WorkspaceSwitcher
            workspaces={actor.availableWorkspaces}
            activeWorkspaceId={actor.workspace.id}
            canManageWorkspaces={hasWorkspacePermission(actor.workspace.role, "MANAGE_WORKSPACE")}
          />
        </div>
        <div className="px-5 py-3 border-b border-p360-lavender-light">
          <CommandPaletteTrigger />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav role={actor.membership.role} />
        </div>
        <div className="px-5 py-4 border-t border-p360-lavender-light">
          <div className="text-sm font-medium text-p360-ink">
            {actor.user.firstName} {actor.user.lastName}
          </div>
          <div className="text-xs text-p360-muted mb-2">{ROLE_LABEL[actor.membership.role]}</div>
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
      </main>
      <CommandPalette role={actor.membership.role} />
    </div>
  );
}
