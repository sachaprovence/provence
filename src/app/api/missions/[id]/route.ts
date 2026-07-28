import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { missionUpdateSchema } from "@/lib/validations/mission";
import { isProvider } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  const existing = await prisma.mission.findFirst({ where: { id, organizationId: actor.organization.id } });
  if (!existing) return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });

  if (isProvider(actor) && existing.territoryId !== actor.membership.territoryId) {
    return NextResponse.json({ error: "Cette mission n'est pas dans votre territoire." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = missionUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  // Un prestataire ne peut modifier que le statut (accepter/refuser/avancer) et les notes.
  const data = isProvider(actor)
    ? { status: parsed.data.status, scheduledAt: parsed.data.scheduledAt, notes: parsed.data.notes }
    : parsed.data;

  const mission = await prisma.mission.update({ where: { id }, data });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "mission.updated",
    entityType: "Mission",
    entityId: id,
    metadata: { status: parsed.data.status },
  });

  return NextResponse.json({ mission });
}
