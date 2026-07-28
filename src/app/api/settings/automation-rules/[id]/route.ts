import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { canManageOrganization } from "@/lib/permissions";

const schema = z.object({ isActive: z.coerce.boolean() });

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageOrganization(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const { id } = await params;

  const existing = await prisma.automationRule.findFirst({ where: { id, organizationId: actor.organization.id } });
  if (!existing) return NextResponse.json({ error: "Règle introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const rule = await prisma.automationRule.update({ where: { id }, data: { isActive: parsed.data.isActive } });
  return NextResponse.json({ rule });
}
