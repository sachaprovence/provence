import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { contactLinkSchema } from "@/lib/validations/crm";
import { listContactsForCompany, linkContactToCompany } from "@/lib/crm/contact-service";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const company = await prisma.company.findFirst({ where: { id, organizationId: actor.organization.id }, select: { id: true } });
    if (!company) return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });

    const links = await listContactsForCompany(actor.organization.id, id);
    return NextResponse.json({ links });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/companies/[id]/contacts" });
  }
}

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const company = await prisma.company.findFirst({ where: { id, organizationId: actor.organization.id }, select: { id: true } });
    if (!company) return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });

    const body = await request.json().catch(() => null);
    const contactId = body?.contactId as string | undefined;
    if (!contactId) return NextResponse.json({ error: "contactId requis." }, { status: 400 });
    const parsed = contactLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const link = await linkContactToCompany(actor.organization.id, contactId, id, parsed.data);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "contact.linked_to_company",
      entityType: "Company",
      entityId: id,
      metadata: { contactId },
    });

    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/companies/[id]/contacts" });
  }
}
