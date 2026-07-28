import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token";
import { addSuppression } from "@/lib/suppression";
import { stopEnrollmentsForLead } from "@/lib/sequence-engine";
import { writeAuditLog } from "@/lib/audit";
import { EnrollmentStopReason, SuppressionReason } from "@/generated/prisma/enums";

type Params = { params: Promise<{ token: string }> };

/** Route publique (aucune authentification) : lien de désinscription inséré dans les emails. */
export async function POST(_request: Request, { params }: Params) {
  const { token } = await params;
  const leadId = verifyUnsubscribeToken(token);
  if (!leadId) return NextResponse.json({ error: "Lien de désinscription invalide." }, { status: 400 });

  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { contacts: true } });
  if (!lead) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });

  const email = lead.contacts.find((c) => c.email)?.email;
  await addSuppression({ organizationId: lead.organizationId, email, reason: SuppressionReason.UNSUBSCRIBED });
  await prisma.lead.update({ where: { id: lead.id }, data: { isSuppressed: true, suppressedAt: new Date(), stage: "UNSUBSCRIBED" } });
  await stopEnrollmentsForLead(lead.id, EnrollmentStopReason.UNSUBSCRIBED);
  await writeAuditLog({
    organizationId: lead.organizationId,
    leadId: lead.id,
    action: "lead.unsubscribed",
    entityType: "Lead",
    entityId: lead.id,
    metadata: { via: "public_link" },
  });

  return NextResponse.json({ ok: true, establishmentName: lead.establishmentName });
}
