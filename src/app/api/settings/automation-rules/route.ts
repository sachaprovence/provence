import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const rules = await prisma.automationRule.findMany({
    where: { organizationId: actor.organization.id },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ rules });
}
