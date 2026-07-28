import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword, recordLoginEvent } from "@/lib/auth";
import { registerSchema } from "@/lib/validations/auth";
import { bootstrapOrganization } from "@/lib/bootstrap";
import { writeAuditLog } from "@/lib/audit";
import { MembershipRole } from "@/generated/prisma/enums";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }
  const { organizationName, firstName, lastName, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await recordLoginEvent({ email, success: false, reason: "email_already_used" });
    return NextResponse.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const { organization, user } = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name: organizationName } });
    const user = await tx.user.create({ data: { email, passwordHash, firstName, lastName } });
    await tx.membership.create({ data: { organizationId: organization.id, userId: user.id, role: MembershipRole.OWNER_ADMIN } });
    return { organization, user };
  });

  await bootstrapOrganization(organization.id);
  await createSession(user.id);
  await recordLoginEvent({ email, success: true, organizationId: organization.id, userId: user.id });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "organization.created",
    entityType: "Organization",
    entityId: organization.id,
  });

  return NextResponse.json({ organizationId: organization.id, userId: user.id }, { status: 201 });
}
