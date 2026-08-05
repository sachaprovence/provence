import { requirePlatformAdminPage } from "@/lib/platform-admin";
import { listAuditLogsForAdmin } from "@/lib/admin/admin-service";

export default async function AdminAuditLogsPage() {
  await requirePlatformAdminPage();
  const logs = await listAuditLogsForAdmin();

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold text-p360-ink">Journaux d&apos;audit</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Date</th>
              <th className="text-left px-4 py-2">Organisation</th>
              <th className="text-left px-4 py-2">Utilisateur</th>
              <th className="text-left px-4 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-p360-lavender-light">
                <td className="px-4 py-2 text-p360-muted whitespace-nowrap">{new Date(log.createdAt).toLocaleString("fr-FR")}</td>
                <td className="px-4 py-2 text-p360-ink">{log.organization?.name ?? "—"}</td>
                <td className="px-4 py-2 text-p360-muted">{log.user ? `${log.user.firstName} ${log.user.lastName}` : "—"}</td>
                <td className="px-4 py-2 text-p360-ink font-mono text-xs">{log.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
