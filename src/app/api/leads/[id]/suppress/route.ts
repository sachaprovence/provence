import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse, requireSalesFeatureApi } from "@/lib/api-helpers";
import { addSuppression } from "@/lib/suppression";
import { stopEnrollmentsForLead } from "@/lib/sequence-engine";
import { writeAuditLog } from "@/lib/audit";
import { EnrollmentStopReason, LeadStage, SuppressionReason } from "@/generated/prisma/enums";

type Params = { params: Promise<{ id: string }> };

/** Ajout manuel à la liste d'exclusion (indépendant d'une désinscription reçue par réponse). */
export async function POST(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const forbiddenResp = requireSalesFeatureApi(actor);
  if (forbiddenResp) return forbiddenResp;
  const { id } = await params;

  const lead = await prisma.lead.findFirst({ where: { id, organizationId: actor.organization.id }, include: { contacts: true } });
  if (!lead) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });

  const email = lead.contacts.find((c) => c.email)?.email;
  const phone = lead.contacts.find((c) => c.phone)?.phone;
  await addSuppression({ organizationId: actor.organization.id, email, phone, reason: SuppressionReason.MANUAL_EXCLUSION });
  await prisma.lead.update({ where: { id: lead.id }, data: { isSuppressed: true, suppressedAt: new Date(), stage: LeadStage.UNSUBSCRIBED } });
  await stopEnrollmentsForLead(lead.id, EnrollmentStopReason.SUPPRESSED);

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    leadId: lead.id,
    action: "lead.manually_suppressed",
    entityType: "Lead",
    entityId: lead.id,
  });

  return NextResponse.json({ ok: true });
}
