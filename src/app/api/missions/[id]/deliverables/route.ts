import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { missionDeliverableSchema } from "@/lib/validations/mission";
import { isProvider } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  const existing = await prisma.mission.findFirst({ where: { id, organizationId: actor.organization.id } });
  if (!existing) return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });
  if (isProvider(actor) && existing.territoryId !== actor.membership.territoryId) {
    return NextResponse.json({ error: "Cette mission n'est pas dans votre territoire." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = missionDeliverableSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Livrable invalide." }, { status: 400 });

  const mission = await prisma.mission.update({
    where: { id },
    data: { deliverables: { push: parsed.data } },
  });

  return NextResponse.json({ mission });
}
