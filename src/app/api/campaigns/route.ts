import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const campaignSchema = z.object({
  name: z.string().min(1).max(150),
  description: z.string().optional().nullable(),
  sequenceId: z.string().optional().nullable(),
});

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const campaigns = await prisma.campaign.findMany({
    where: { organizationId: actor.organization.id },
    include: { sequence: true, _count: { select: { leads: true, enrollments: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ campaigns });
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const body = await request.json().catch(() => null);
  const parsed = campaignSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const campaign = await prisma.campaign.create({
    data: { organizationId: actor.organization.id, ...parsed.data },
  });
  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "campaign.created",
    entityType: "Campaign",
    entityId: campaign.id,
  });
  return NextResponse.json({ campaign }, { status: 201 });
}
