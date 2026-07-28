import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { icpSchema } from "@/lib/validations/icp";

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const icps = await prisma.idealCustomerProfile.findMany({
    where: { organizationId: actor.organization.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { leads: true } } },
  });
  return NextResponse.json({ icps });
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const body = await request.json().catch(() => null);
  const parsed = icpSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });

  const icp = await prisma.idealCustomerProfile.create({
    data: { organizationId: actor.organization.id, ...parsed.data },
  });
  return NextResponse.json({ icp }, { status: 201 });
}
