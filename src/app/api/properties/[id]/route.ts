import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { isAdmin } from "@/lib/permissions";
import { propertyUpdateSchema } from "@/lib/validations/crm";
import { getProperty, updateProperty, deleteProperty } from "@/lib/crm/property-service";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const property = await getProperty(actor.organization.id, id);
    return NextResponse.json({ property });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/properties/[id]" });
  }
}

export async function PUT(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => null);
    const parsed = propertyUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const property = await updateProperty(actor.organization.id, id, parsed.data);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      leadId: property.leadId,
      action: "property.updated",
      entityType: "Property",
      entityId: property.id,
    });

    return NextResponse.json({ property });
  } catch (error) {
    return toApiErrorResponse(error, { route: "PUT /api/properties/[id]" });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!isAdmin(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const { id } = await params;

  try {
    await deleteProperty(actor.organization.id, id);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "property.deleted",
      entityType: "Property",
      entityId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, { route: "DELETE /api/properties/[id]" });
  }
}
