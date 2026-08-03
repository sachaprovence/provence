import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { isAdmin } from "@/lib/permissions";
import { emailIntegrationConfigUpdateSchema } from "@/lib/validations/organization";
import { getEmailConfigPreview, updateEmailIntegrationConfig } from "@/lib/email/config";

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const preview = await getEmailConfigPreview(actor.organization.id);
  return NextResponse.json({ config: preview });
}

export async function PUT(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!isAdmin(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = emailIntegrationConfigUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });

  await updateEmailIntegrationConfig(actor.organization.id, parsed.data);
  const preview = await getEmailConfigPreview(actor.organization.id);
  return NextResponse.json({ config: preview });
}
