import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { leadWhereForActor } from "@/lib/permissions";
import { toApiErrorResponse } from "@/lib/errors";
import { unlinkContactFromLead } from "@/lib/crm/contact-service";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string; contactId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id, contactId } = await params;

  try {
    const lead = await prisma.lead.findFirst({ where: { id, ...leadWhereForActor(actor) }, select: { id: true } });
    if (!lead) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });

    await unlinkContactFromLead(actor.organization.id, contactId, id);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "contact.unlinked_from_lead",
      entityType: "Lead",
      entityId: id,
      metadata: { contactId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, { route: "DELETE /api/leads/[id]/contacts/[contactId]" });
  }
}
