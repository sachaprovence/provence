import { requireActor } from "@/lib/auth";
import { SidebarNav } from "@/components/sidebar-nav";
import { LogoutButton } from "@/components/logout-button";

const ROLE_LABEL: Record<string, string> = {
  OWNER_ADMIN: "Administrateur",
  SALES: "Commercial",
  PROVIDER: "Prestataire régional",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 shrink-0 border-r border-p360-lavender-light bg-white flex flex-col">
        <div className="px-5 py-5 border-b border-p360-lavender-light">
          <div className="text-lg font-semibold text-p360-blue">Provence 360</div>
          <div className="text-xs text-p360-muted mt-0.5">{actor.organization.name}</div>
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
    </div>
  );
}
