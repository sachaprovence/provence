import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { getUnifiedConnectorsView } from "@/lib/integrations/connectors-service";
import { ConnectorsClient } from "@/components/connectors-client";

export default async function ConnectorsPage() {
  const actor = await requireWorkspaceActor();
  const canManage = hasWorkspacePermission(actor.workspace.role, "MANAGE_WORKSPACE");
  const view = await getUnifiedConnectorsView(actor);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">Connecteurs</h1>
        <p className="mt-1 text-sm text-p360-muted">
          Gmail, Google Calendar, Slack, Discord et Stripe — tout depuis cet écran, sans terminal.
        </p>
      </div>
      <ConnectorsClient initialView={view} canManage={canManage} />
    </div>
  );
}
