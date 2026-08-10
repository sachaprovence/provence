import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MembershipRole } from "@/generated/prisma/enums";
import { NavigationSettingsClient } from "@/components/navigation-settings-client";

const ROLE_LABEL: Record<string, string> = {
  OWNER_ADMIN: "Administrateur",
  SALES: "Commercial",
  PROVIDER: "Prestataire régional",
};

export default async function NavigationSettingsPage() {
  const actor = await requireRole([MembershipRole.OWNER_ADMIN]);

  const memberships = await prisma.membership.findMany({
    where: { organizationId: actor.organization.id },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">Menu / Navigation</h1>
        <p className="text-p360-muted text-sm mt-1">
          Choisissez, pour chaque membre de l&apos;organisation, les sections visibles dans son menu.
          Masquer une section ne retire aucun droit d&apos;accès — c&apos;est uniquement un réglage d&apos;affichage.
        </p>
      </div>
      <NavigationSettingsClient
        currentUserId={actor.user.id}
        members={memberships.map((m) => ({
          userId: m.userId,
          name: `${m.user.firstName} ${m.user.lastName}`.trim() || m.user.email,
          role: m.role,
          roleLabel: ROLE_LABEL[m.role] ?? m.role,
        }))}
      />
    </div>
  );
}
