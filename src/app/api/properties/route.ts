import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { propertyCreateSchema } from "@/lib/validations/crm";
import { listProperties, createProperty } from "@/lib/crm/property-service";
import { writeAuditLog } from "@/lib/audit";
import { publishAutomationEvent } from "@/lib/automation/triggers/event-dispatcher";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("leadId") ?? undefined;
  const companyId = searchParams.get("companyId") ?? undefined;

  try {
    const properties = await listProperties(actor.organization.id, { leadId, companyId });
    return NextResponse.json({ properties });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/properties" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const body = await request.json().catch(() => null);
    const parsed = propertyCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const property = await createProperty(actor.organization.id, parsed.data);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      leadId: property.leadId,
      action: "property.created",
      entityType: "Property",
      entityId: property.id,
    });
    await publishAutomationEvent("property.created", { organizationId: actor.organization.id, leadId: property.leadId });

    return NextResponse.json({ property }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/properties" });
  }
}
