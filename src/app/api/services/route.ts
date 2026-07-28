import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { canManageOrganization } from "@/lib/permissions";

const schema = z.object({
  kind: z.enum(["VIRTUAL_TOUR_SIMPLE", "VIRTUAL_TOUR_PREMIUM", "PHOTO_PACK_AND_TOUR", "MULTI_UNIT_OFFER", "UPDATE_SUBSCRIPTION", "OUT_OF_ZONE_TRAVEL", "CUSTOM"]),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  basePrice: z.coerce.number().int().min(0),
});

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const services = await prisma.service.findMany({
    where: { organizationId: actor.organization.id, isActive: true },
    orderBy: { basePrice: "asc" },
  });
  return NextResponse.json({ services });
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageOrganization(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const service = await prisma.service.create({ data: { organizationId: actor.organization.id, ...parsed.data } });
  return NextResponse.json({ service }, { status: 201 });
}
