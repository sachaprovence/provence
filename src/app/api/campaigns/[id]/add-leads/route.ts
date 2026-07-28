import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse, requireSalesFeatureApi } from "@/lib/api-helpers";
import { enrollLeadInSequence, DuplicateEnrollmentError, SuppressedLeadError } from "@/lib/sequence-engine";

const schema = z.object({ leadIds: z.array(z.string()).min(1) });

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const forbiddenResp = requireSalesFeatureApi(actor);
  if (forbiddenResp) return forbiddenResp;
  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({ where: { id, organizationId: actor.organization.id } });
  if (!campaign) return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Liste de prospects invalide." }, { status: 400 });

  const leads = await prisma.lead.findMany({
    where: { id: { in: parsed.data.leadIds }, organizationId: actor.organization.id },
  });

  await prisma.lead.updateMany({
    where: { id: { in: leads.map((l) => l.id) } },
    data: { campaignId: campaign.id },
  });

  let enrolled = 0;
  const skipped: { leadId: string; reason: string }[] = [];

  if (campaign.sequenceId) {
    for (const lead of leads) {
      try {
        await enrollLeadInSequence({ leadId: lead.id, sequenceId: campaign.sequenceId, campaignId: campaign.id });
        enrolled += 1;
      } catch (err) {
        if (err instanceof SuppressedLeadError) skipped.push({ leadId: lead.id, reason: "désinscrit / liste d'exclusion" });
        else if (err instanceof DuplicateEnrollmentError) skipped.push({ leadId: lead.id, reason: "déjà inscrit" });
        else skipped.push({ leadId: lead.id, reason: "erreur inconnue" });
      }
    }
  }

  return NextResponse.json({ attached: leads.length, enrolled, skipped });
}
