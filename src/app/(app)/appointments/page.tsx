import { requireRole } from "@/lib/auth";
import { MembershipRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { AppointmentsClient } from "@/components/appointments-client";

export default async function AppointmentsPage() {
  const actor = await requireRole([MembershipRole.OWNER_ADMIN, MembershipRole.SALES]);
  const appointments = await prisma.appointment.findMany({
    where: { organizationId: actor.organization.id },
    include: { lead: true },
    orderBy: { startAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Rendez-vous</h1>
      <AppointmentsClient appointments={appointments} />
    </div>
  );
}
