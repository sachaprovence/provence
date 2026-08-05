import { requirePlatformAdminPage } from "@/lib/platform-admin";
import { listUsersForAdmin } from "@/lib/admin/admin-service";

export default async function AdminUsersPage() {
  await requirePlatformAdminPage();
  const users = await listUsersForAdmin();

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold text-p360-ink">Utilisateurs</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Nom</th>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Organisations</th>
              <th className="text-left px-4 py-2">Statut</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-p360-lavender-light">
                <td className="px-4 py-2 text-p360-ink">
                  {user.firstName} {user.lastName}
                  {user.isPlatformAdmin && <span className="badge bg-p360-blue/10 text-p360-blue ml-2">admin plateforme</span>}
                </td>
                <td className="px-4 py-2 text-p360-muted">{user.email}</td>
                <td className="px-4 py-2 text-p360-muted">{user.organizations.map((o) => o.name).join(", ") || "—"}</td>
                <td className="px-4 py-2">
                  <span className={`badge ${user.isActive ? "bg-p360-success/10 text-p360-success" : "bg-p360-danger/10 text-p360-danger"}`}>
                    {user.isActive ? "Actif" : "Désactivé"}
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
