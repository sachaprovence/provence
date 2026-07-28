import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { canManageOrganization } from "@/lib/permissions";
import { organizationSettingsSchema } from "@/lib/validations/organization";

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageOrganization(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organization.id } });
  return NextResponse.json({ organization });
}

export async function PUT(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageOrganization(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = organizationSettingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });

  const organization = await prisma.organization.update({
    where: { id: actor.organization.id },
    data: parsed.data,
  });
  return NextResponse.json({ organization });
}
