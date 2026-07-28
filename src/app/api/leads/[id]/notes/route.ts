import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const noteSchema = z.object({ body: z.string().min(1).max(5000) });

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  const lead = await prisma.lead.findFirst({ where: { id, organizationId: actor.organization.id } });
  if (!lead) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Note invalide." }, { status: 400 });

  const note = await prisma.leadNote.create({
    data: { leadId: id, authorId: actor.user.id, body: parsed.data.body },
    include: { author: true },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    leadId: id,
    action: "lead.note_added",
    entityType: "LeadNote",
    entityId: note.id,
  });

  return NextResponse.json({ note }, { status: 201 });
}
