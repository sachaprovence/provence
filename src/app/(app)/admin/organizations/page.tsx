import Link from "next/link";
import { requirePlatformAdminPage } from "@/lib/platform-admin";
import { listOrganizationsForAdmin } from "@/lib/admin/admin-service";

const STATUS_LABEL: Record<string, string> = {
  TRIALING: "Essai",
  ACTIVE: "Actif",
  PAST_DUE: "Paiement en retard",
  CANCELED: "Résilié",
  RESTRICTED: "Suspendu",
};

export default async function AdminOrganizationsPage() {
  await requirePlatformAdminPage();
  const organizations = await listOrganizationsForAdmin();

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold text-p360-ink">Organisations</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Nom</th>
              <th className="text-left px-4 py-2">Plan</th>
              <th className="text-left px-4 py-2">Statut</th>
              <th className="text-left px-4 py-2">Membres</th>
              <th className="text-left px-4 py-2">Créée le</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((org) => (
              <tr key={org.id} className="border-t border-p360-lavender-light">
                <td className="px-4 py-2">
                  <Link href={`/admin/organizations/${org.id}`} className="text-p360-blue hover:underline">
                    {org.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-p360-muted">{org.planName ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={`badge ${org.subscriptionStatus === "RESTRICTED" ? "bg-p360-danger/10 text-p360-danger" : "bg-p360-lavender-light text-p360-blue"}`}>
                    {STATUS_LABEL[org.subscriptionStatus] ?? org.subscriptionStatus}
                  </span>
                </td>
                <td className="px-4 py-2 text-p360-muted">{org.memberCount}</td>
                <td className="px-4 py-2 text-p360-muted">{new Date(org.createdAt).toLocaleDateString("fr-FR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
