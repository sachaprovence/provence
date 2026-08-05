import Link from "next/link";
import { requirePlatformAdminPage } from "@/lib/platform-admin";
import { getPlatformOverview, getGlobalErrorSummary } from "@/lib/admin/admin-service";

const STATUS_LABEL: Record<string, string> = {
  TRIALING: "Essai",
  ACTIVE: "Actif",
  PAST_DUE: "Paiement en retard",
  CANCELED: "Résilié",
  RESTRICTED: "Suspendu",
};

export default async function AdminOverviewPage() {
  await requirePlatformAdminPage();
  const [overview, errors] = await Promise.all([getPlatformOverview(), getGlobalErrorSummary()]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">Administration de la plateforme</h1>
        <p className="text-p360-muted mt-1">Vue d&apos;ensemble — toutes les organisations.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-xs text-p360-muted uppercase">Organisations</div>
          <div className="text-2xl font-semibold text-p360-ink">{overview.organizationCount}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-p360-muted uppercase">Utilisateurs</div>
          <div className="text-2xl font-semibold text-p360-ink">{overview.userCount}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-p360-muted uppercase">Taux d&apos;erreur API (7j)</div>
          <div className="text-2xl font-semibold text-p360-ink">{(errors.errorRate * 100).toFixed(1)}%</div>
          <div className="text-xs text-p360-muted mt-1">
            {errors.errors}/{errors.total} requêtes
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-p360-muted uppercase">Statuts d&apos;abonnement</div>
          <ul className="mt-1 text-sm text-p360-ink space-y-0.5">
            {overview.byStatus.map((row) => (
              <li key={row.status}>
                {STATUS_LABEL[row.status] ?? row.status} : {row.count}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex gap-3">
        <Link href="/admin/organizations" className="btn-secondary">
          Organisations
        </Link>
        <Link href="/admin/users" className="btn-secondary">
          Utilisateurs
        </Link>
        <Link href="/admin/audit-logs" className="btn-secondary">
          Journaux d&apos;audit
        </Link>
      </div>
    </div>
  );
}
