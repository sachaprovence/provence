import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { canManageOrganization } from "@/lib/permissions";
import { isUniqueConstraintError } from "@/lib/prisma-errors";

const schema = z.object({ name: z.string().min(1), centerCity: z.string().min(1), radiusKm: z.coerce.number().int().min(1).default(40) });

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const territories = await prisma.territory.findMany({
    where: { organizationId: actor.organization.id },
    include: { _count: { select: { leads: true, providers: true, missions: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ territories });
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageOrganization(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  try {
    const territory = await prisma.territory.create({ data: { organizationId: actor.organization.id, ...parsed.data } });
    return NextResponse.json({ territory }, { status: 201 });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return NextResponse.json({ error: "Un territoire porte déjà ce nom." }, { status: 409 });
    }
    throw err;
  }
}
