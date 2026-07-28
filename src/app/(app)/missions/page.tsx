import { requireActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MissionsClient } from "@/components/missions-client";
import { isProvider } from "@/lib/permissions";

export default async function MissionsPage() {
  const actor = await requireActor();
  const provider = isProvider(actor);

  const missions = await prisma.mission.findMany({
    where: {
      organizationId: actor.organization.id,
      ...(provider ? { territoryId: actor.membership.territoryId ?? "__none__" } : {}),
    },
    include: { customer: { include: { lead: true } }, provider: true, territory: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Missions</h1>
      <p className="text-sm text-p360-muted">
        {provider ? "Missions de votre territoire." : "Toutes les missions de l'organisation."}
      </p>
      <MissionsClient missions={missions} canEdit={true} />
    </div>
  );
}
