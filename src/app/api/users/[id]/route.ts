import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { canManageUsers } from "@/lib/permissions";

const updateSchema = z.object({
  role: z.enum(["OWNER_ADMIN", "SALES", "PROVIDER"]).optional(),
  territoryId: z.string().optional().nullable(),
  isActive: z.coerce.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageUsers(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const { id } = await params;

  const membership = await prisma.membership.findFirst({ where: { id, organizationId: actor.organization.id } });
  if (!membership) return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const updated = await prisma.membership.update({
    where: { id },
    data: { role: parsed.data.role, territoryId: parsed.data.territoryId },
  });

  if (parsed.data.isActive !== undefined) {
    await prisma.user.update({ where: { id: membership.userId }, data: { isActive: parsed.data.isActive } });
  }

  return NextResponse.json({ membership: updated });
}
