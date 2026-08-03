import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { leadWhereForActor } from "@/lib/permissions";
import { toApiErrorResponse } from "@/lib/errors";
import { getLeadTimeline } from "@/lib/crm/timeline-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const lead = await prisma.lead.findFirst({ where: { id, ...leadWhereForActor(actor) }, select: { id: true } });
    if (!lead) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });

    const events = await getLeadTimeline(actor.organization.id, id);
    return NextResponse.json({ events });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/leads/[id]/timeline" });
  }
}
