import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InviteUserForm } from "@/components/invite-user-form";
import { MembershipRole } from "@/generated/prisma/enums";

const ROLE_LABEL: Record<string, string> = { OWNER_ADMIN: "Administrateur", SALES: "Commercial", PROVIDER: "Prestataire régional" };

export default async function UsersPage() {
  const actor = await requireRole([MembershipRole.OWNER_ADMIN]);

  const [members, territories] = await Promise.all([
    prisma.membership.findMany({ where: { organizationId: actor.organization.id }, include: { user: true, territory: true }, orderBy: { createdAt: "asc" } }),
    prisma.territory.findMany({ where: { organizationId: actor.organization.id } }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Utilisateurs</h1>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Nom</th>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Rôle</th>
              <th className="text-left px-4 py-2">Territoire</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-p360-lavender-light">
                <td className="px-4 py-2 text-p360-ink">{m.user.firstName} {m.user.lastName}</td>
                <td className="px-4 py-2 text-p360-muted">{m.user.email}</td>
                <td className="px-4 py-2"><span className="badge bg-p360-lavender-light text-p360-blue">{ROLE_LABEL[m.role]}</span></td>
                <td className="px-4 py-2 text-p360-muted">{m.territory?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-p360-ink mb-4">Ajouter un utilisateur</h2>
        <InviteUserForm territories={territories.map((t) => ({ id: t.id, name: t.name }))} />
      </div>
    </div>
  );
}
