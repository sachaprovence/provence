import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { WebhooksClient } from "./webhooks-client";

/** Gestion des webhooks sortants (v1.0, AR-0061) — mêmes garde-fous UI que /settings/api-keys. */
export default async function WebhooksPage() {
  const actor = await requireWorkspaceActor();

  if (!hasWorkspacePermission(actor.workspace.role, "MANAGE_WORKSPACE")) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-p360-danger">Vous n&apos;avez pas la permission de gérer les webhooks sortants.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">Webhooks sortants</h1>
        <p className="text-sm text-p360-muted mt-1">
          Recevez une notification HTTP (signée HMAC) vers votre système lorsqu&apos;un évènement survient :
          prospect créé, devis signé, facture payée.
        </p>
      </div>
      <WebhooksClient />
    </div>
  );
}
