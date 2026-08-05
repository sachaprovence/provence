import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { canManageUsers } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { removeOrganizationMember } from "@/lib/organization-service";
import { toApiErrorResponse } from "@/lib/errors";

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

  // Journalisation (v1.4, AR-0178) — changement de rôle et/ou d'activation d'un membre :
  // opération sensible, jamais silencieuse.
  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "organization.member_updated",
    entityType: "Membership",
    entityId: id,
    metadata: { targetUserId: membership.userId, role: parsed.data.role, isActive: parsed.data.isActive },
  });

  return NextResponse.json({ membership: updated });
}

/** Retrait définitif d'un membre de l'organisation (v1.4, AR-0178) — voir `removeOrganizationMember`. */
export async function DELETE(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageUsers(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const { id } = await params;

  try {
    await removeOrganizationMember(actor, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "DELETE /api/users/[id]" });
  }
}
