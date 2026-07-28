import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { sequenceStepSchema } from "@/lib/validations/sequence";

const updateSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().optional().nullable(),
  isActive: z.coerce.boolean().optional(),
  steps: z.array(sequenceStepSchema).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;
  const sequence = await prisma.sequence.findFirst({
    where: { id, organizationId: actor.organization.id },
    include: { steps: { orderBy: { order: "asc" } }, enrollments: { include: { lead: true } } },
  });
  if (!sequence) return NextResponse.json({ error: "Séquence introuvable." }, { status: 404 });
  return NextResponse.json({ sequence });
}

export async function PUT(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;
  const existing = await prisma.sequence.findFirst({ where: { id, organizationId: actor.organization.id } });
  if (!existing) return NextResponse.json({ error: "Séquence introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const { steps, ...data } = parsed.data;

  const sequence = await prisma.$transaction(async (tx) => {
    if (steps) {
      await tx.sequenceStep.deleteMany({ where: { sequenceId: id } });
      await tx.sequenceStep.createMany({ data: steps.map((s) => ({ ...s, sequenceId: id })) });
    }
    return tx.sequence.update({
      where: { id },
      data,
      include: { steps: { orderBy: { order: "asc" } } },
    });
  });

  return NextResponse.json({ sequence });
}
