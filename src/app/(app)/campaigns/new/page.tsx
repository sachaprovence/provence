import { requireActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NewCampaignForm } from "@/components/new-campaign-form";

export default async function NewCampaignPage() {
  const actor = await requireActor();
  const sequences = await prisma.sequence.findMany({ where: { organizationId: actor.organization.id, isActive: true } });

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold text-p360-ink mb-6">Nouvelle campagne</h1>
      <div className="card p-6">
        <NewCampaignForm sequences={sequences.map((s) => ({ id: s.id, name: s.name }))} />
      </div>
    </div>
  );
}
