import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";

const updateSchema = z.object({
  status: z.enum(["OPEN", "DONE", "CANCELLED"]).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  dueAt: z.coerce.date().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;
  const existing = await prisma.task.findFirst({ where: { id, organizationId: actor.organization.id } });
  if (!existing) return NextResponse.json({ error: "Tâche introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const task = await prisma.task.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ task });
}
