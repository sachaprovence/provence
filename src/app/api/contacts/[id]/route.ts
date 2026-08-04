import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { isAdmin } from "@/lib/permissions";
import { contactUpdateSchema } from "@/lib/validations/crm";
import { getContact, updateContact, deleteContact } from "@/lib/crm/contact-service";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const contact = await getContact(actor.organization.id, id);
    return NextResponse.json({ contact });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/contacts/[id]" });
  }
}

export async function PUT(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => null);
    const parsed = contactUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const contact = await updateContact(actor.organization.id, id, parsed.data);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "contact.updated",
      entityType: "Contact",
      entityId: contact.id,
    });

    return NextResponse.json({ contact });
  } catch (error) {
    return toApiErrorResponse(error, { route: "PUT /api/contacts/[id]" });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!isAdmin(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const { id } = await params;

  try {
    await deleteContact(actor.organization.id, id);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "contact.deleted",
      entityType: "Contact",
      entityId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, { route: "DELETE /api/contacts/[id]" });
  }
}
