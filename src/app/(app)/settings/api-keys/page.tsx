import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { ApiKeysClient } from "./api-keys-client";

/** Gestion des clés API publiques (v1.0, AR-0059) — mêmes garde-fous UI que /settings/metrics. */
export default async function ApiKeysPage() {
  const actor = await requireWorkspaceActor();

  if (!hasWorkspacePermission(actor.workspace.role, "MANAGE_WORKSPACE")) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-p360-danger">Vous n&apos;avez pas la permission de gérer les clés API.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">Clés API</h1>
        <p className="text-sm text-p360-muted mt-1">
          Utilisez une clé API pour lire vos données (prospects, opportunités, factures) depuis un système
          externe — voir <code>docs/api/openapi.yaml</code>.
        </p>
      </div>
      <ApiKeysClient />
    </div>
  );
}
