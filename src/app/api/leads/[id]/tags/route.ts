import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { leadWhereForActor } from "@/lib/permissions";
import { toApiErrorResponse } from "@/lib/errors";
import { assignTagToLead } from "@/lib/crm/tag-service";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const lead = await prisma.lead.findFirst({ where: { id, ...leadWhereForActor(actor) }, select: { id: true } });
    if (!lead) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });

    const body = await request.json().catch(() => null);
    const tagId = body?.tagId as string | undefined;
    if (!tagId) return NextResponse.json({ error: "tagId requis." }, { status: 400 });

    await assignTagToLead(actor.organization.id, tagId, id);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "tag.assigned_to_lead",
      entityType: "Lead",
      entityId: id,
      metadata: { tagId },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/leads/[id]/tags" });
  }
}
