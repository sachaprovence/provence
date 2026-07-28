import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { sequenceSchema } from "@/lib/validations/sequence";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const sequences = await prisma.sequence.findMany({
    where: { organizationId: actor.organization.id },
    include: { steps: { orderBy: { order: "asc" } }, _count: { select: { enrollments: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ sequences });
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const body = await request.json().catch(() => null);
  const parsed = sequenceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });

  const { steps, ...data } = parsed.data;
  const sequence = await prisma.sequence.create({
    data: {
      organizationId: actor.organization.id,
      ...data,
      steps: { create: steps },
    },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "sequence.created",
    entityType: "Sequence",
    entityId: sequence.id,
  });

  return NextResponse.json({ sequence }, { status: 201 });
}
