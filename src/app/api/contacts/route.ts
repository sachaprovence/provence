import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { contactCreateSchema } from "@/lib/validations/crm";
import { listContacts, createContact } from "@/lib/crm/contact-service";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const contacts = await listContacts(actor.organization.id);
    return NextResponse.json({ contacts });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/contacts" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const body = await request.json().catch(() => null);
    const parsed = contactCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const contact = await createContact(actor.organization.id, parsed.data);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "contact.created",
      entityType: "Contact",
      entityId: contact.id,
    });

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/contacts" });
  }
}
