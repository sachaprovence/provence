import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { leadWhereForActor } from "@/lib/permissions";
import { toApiErrorResponse } from "@/lib/errors";
import { contactLinkSchema } from "@/lib/validations/crm";
import { listContactsForLead, linkContactToLead } from "@/lib/crm/contact-service";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const lead = await prisma.lead.findFirst({ where: { id, ...leadWhereForActor(actor) }, select: { id: true } });
    if (!lead) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });

    const links = await listContactsForLead(actor.organization.id, id);
    return NextResponse.json({ links });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/leads/[id]/contacts" });
  }
}

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const lead = await prisma.lead.findFirst({ where: { id, ...leadWhereForActor(actor) }, select: { id: true } });
    if (!lead) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });

    const body = await request.json().catch(() => null);
    const contactId = body?.contactId as string | undefined;
    if (!contactId) return NextResponse.json({ error: "contactId requis." }, { status: 400 });
    const parsed = contactLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const link = await linkContactToLead(actor.organization.id, contactId, id, parsed.data);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "contact.linked_to_lead",
      entityType: "Lead",
      entityId: id,
      metadata: { contactId },
    });

    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/leads/[id]/contacts" });
  }
}
