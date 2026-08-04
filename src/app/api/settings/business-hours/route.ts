import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { isAdmin } from "@/lib/permissions";
import { businessHoursUpdateSchema } from "@/lib/validations/business-hours";
import { getBusinessHoursConfig, updateBusinessHours } from "@/lib/settings/business-hours-service";

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const config = await getBusinessHoursConfig(actor.organization.id);
    return NextResponse.json({ config });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/settings/business-hours" });
  }
}

export async function PUT(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!isAdmin(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = businessHoursUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const config = await updateBusinessHours(actor.organization.id, parsed.data);
    return NextResponse.json({ config });
  } catch (error) {
    return toApiErrorResponse(error, { route: "PUT /api/settings/business-hours" });
  }
}
