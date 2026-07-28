import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";

const updateSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().optional().nullable(),
  sequenceId: z.string().optional().nullable(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"]).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;
  const campaign = await prisma.campaign.findFirst({
    where: { id, organizationId: actor.organization.id },
    include: {
      sequence: { include: { steps: { orderBy: { order: "asc" } } } },
      leads: { include: { scores: { orderBy: { computedAt: "desc" }, take: 1 } } },
      enrollments: true,
    },
  });
  if (!campaign) return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 });
  return NextResponse.json({ campaign });
}

export async function PUT(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;
  const existing = await prisma.campaign.findFirst({ where: { id, organizationId: actor.organization.id } });
  if (!existing) return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const campaign = await prisma.campaign.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ campaign });
}
