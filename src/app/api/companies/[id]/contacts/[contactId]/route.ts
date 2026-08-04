import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { unlinkContactFromCompany } from "@/lib/crm/contact-service";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string; contactId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id, contactId } = await params;

  try {
    const company = await prisma.company.findFirst({ where: { id, organizationId: actor.organization.id }, select: { id: true } });
    if (!company) return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });

    await unlinkContactFromCompany(actor.organization.id, contactId, id);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "contact.unlinked_from_company",
      entityType: "Company",
      entityId: id,
      metadata: { contactId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "DELETE /api/companies/[id]/contacts/[contactId]" });
  }
}
