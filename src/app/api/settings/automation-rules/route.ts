import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { canManageOrganization } from "@/lib/permissions";

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageOrganization(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const rules = await prisma.automationRule.findMany({
    where: { organizationId: actor.organization.id },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ rules });
}
