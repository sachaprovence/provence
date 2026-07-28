import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { isProvider } from "@/lib/permissions";

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  const missions = await prisma.mission.findMany({
    where: {
      organizationId: actor.organization.id,
      ...(isProvider(actor) ? { territoryId: actor.membership.territoryId ?? "__none__" } : {}),
    },
    include: { customer: { include: { lead: true } }, provider: true, territory: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ missions });
}
