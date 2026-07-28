import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { canManageUsers } from "@/lib/permissions";
import { inviteUserSchema } from "@/lib/validations/organization";
import { hashPassword } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { isUniqueConstraintError } from "@/lib/prisma-errors";

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  const memberships = await prisma.membership.findMany({
    where: { organizationId: actor.organization.id },
    include: { user: true, territory: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ members: memberships });
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageUsers(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = inviteUserSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    const alreadyMember = await prisma.membership.findFirst({ where: { userId: existing.id, organizationId: actor.organization.id } });
    if (alreadyMember) return NextResponse.json({ error: "Cet utilisateur fait déjà partie de l'organisation." }, { status: 409 });
  }

  const passwordHash = await hashPassword(data.temporaryPassword);

  let membership;
  try {
    const user =
      existing ??
      (await prisma.user.create({ data: { email: data.email, firstName: data.firstName, lastName: data.lastName, passwordHash } }));

    membership = await prisma.membership.create({
      data: {
        organizationId: actor.organization.id,
        userId: user.id,
        role: data.role,
        territoryId: data.territoryId || undefined,
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return NextResponse.json({ error: "Cet utilisateur existe déjà ou fait déjà partie de l'organisation." }, { status: 409 });
    }
    throw err;
  }

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "user.invited",
    entityType: "Membership",
    entityId: membership.id,
    metadata: { role: data.role },
  });

  return NextResponse.json({ membership }, { status: 201 });
}
