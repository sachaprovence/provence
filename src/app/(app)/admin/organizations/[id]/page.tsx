import { requirePlatformAdminPage } from "@/lib/platform-admin";
import { getOrganizationDetailForAdmin } from "@/lib/admin/admin-service";
import { AdminOrganizationActions } from "@/components/admin/admin-organization-actions";

const STATUS_LABEL: Record<string, string> = {
  TRIALING: "Essai",
  ACTIVE: "Actif",
  PAST_DUE: "Paiement en retard",
  CANCELED: "Résilié",
  RESTRICTED: "Suspendu",
};

function quotaLine(label: string, dim: { used: number; limit: number | null; status: string }) {
  const color = dim.status === "blocked" ? "text-p360-danger" : dim.status === "warning" ? "text-p360-warning" : "text-p360-muted";
  return (
    <div className={`flex justify-between ${color}`}>
      <span>{label}</span>
      <span>
        {dim.used}
        {dim.limit !== null ? ` / ${dim.limit}` : " (illimité)"}
      </span>
    </div>
  );
}

export default async function AdminOrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdminPage();
  const { id } = await params;
  const organization = await getOrganizationDetailForAdmin(id);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">{organization.name}</h1>
        <span className="badge bg-p360-lavender-light text-p360-blue mt-1 inline-block">
          {STATUS_LABEL[organization.subscriptionStatus] ?? organization.subscriptionStatus}
        </span>
      </div>

      <AdminOrganizationActions
        organizationId={organization.id}
        currentPlanKey={organization.plan?.key ?? null}
        isSuspended={organization.subscriptionStatus === "RESTRICTED"}
      />

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-p360-ink mb-3">Usage vs plan ({organization.plan?.name ?? "aucun plan"})</h2>
        <div className="space-y-1 text-sm">
          {quotaLine("Membres", organization.usage.members)}
          {quotaLine("Exécutions d'automatisation (30j)", organization.usage.automationRuns)}
          {quotaLine("Stockage (Mo)", organization.usage.storageMb)}
          {quotaLine("Connecteurs", organization.usage.connectors)}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Nom</th>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Rôle</th>
              <th className="text-left px-4 py-2">Statut</th>
            </tr>
          </thead>
          <tbody>
            {organization.members.map((m) => (
              <tr key={m.id} className="border-t border-p360-lavender-light">
                <td className="px-4 py-2 text-p360-ink">
                  {m.firstName} {m.lastName}
                </td>
                <td className="px-4 py-2 text-p360-muted">{m.email}</td>
                <td className="px-4 py-2 text-p360-muted">{m.role}</td>
                <td className="px-4 py-2">
                  <span className={`badge ${m.isActive ? "bg-p360-success/10 text-p360-success" : "bg-p360-danger/10 text-p360-danger"}`}>
                    {m.isActive ? "Actif" : "Désactivé"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
