import { requireActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listVirtualTours } from "@/lib/production/virtual-tour-service";
import { VirtualToursClient } from "@/components/virtual-tours-client";

export default async function VisitsPage() {
  const actor = await requireActor();

  const [virtualTours, missions] = await Promise.all([
    listVirtualTours(actor.organization.id),
    prisma.mission.findMany({
      where: { organizationId: actor.organization.id },
      include: { customer: { include: { lead: { select: { id: true, establishmentName: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Visites 3D</h1>
      <p className="text-sm text-p360-muted">Chaque visite est liée à une mission (client, prestataire, planification déjà gérés par les missions).</p>
      <VirtualToursClient
        virtualTours={virtualTours}
        missions={missions.map((m) => ({ id: m.id, title: m.title, leadName: m.customer.lead.establishmentName }))}
      />
    </div>
  );
}
