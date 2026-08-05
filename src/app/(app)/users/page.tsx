import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InviteUserForm } from "@/components/invite-user-form";
import { TeamMembersTable } from "@/components/team-members-table";
import { MembershipRole } from "@/generated/prisma/enums";

export default async function UsersPage() {
  const actor = await requireRole([MembershipRole.OWNER_ADMIN]);

  const [members, territories] = await Promise.all([
    prisma.membership.findMany({ where: { organizationId: actor.organization.id }, include: { user: true, territory: true }, orderBy: { createdAt: "asc" } }),
    prisma.territory.findMany({ where: { organizationId: actor.organization.id } }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Utilisateurs</h1>

      <TeamMembersTable
        currentUserId={actor.user.id}
        members={members.map((m) => ({
          id: m.id,
          role: m.role,
          userId: m.userId,
          user: { firstName: m.user.firstName, lastName: m.user.lastName, email: m.user.email, isActive: m.user.isActive },
          territory: m.territory ? { name: m.territory.name } : null,
        }))}
      />

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-p360-ink mb-4">Ajouter un utilisateur</h2>
        <InviteUserForm territories={territories.map((t) => ({ id: t.id, name: t.name }))} />
      </div>
    </div>
  );
}
