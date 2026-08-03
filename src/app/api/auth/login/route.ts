import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertLoginNotLocked, createSession, recordLoginEvent, verifyPassword } from "@/lib/auth";
import { loginSchema } from "@/lib/validations/auth";
import { publishAutomationEvent } from "@/lib/automation/triggers/event-dispatcher";
import { TooManyRequestsError } from "@/lib/errors";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  }
  const { email, password } = parsed.data;

  try {
    await assertLoginNotLocked(email);
  } catch (error) {
    if (error instanceof TooManyRequestsError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    throw error;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { take: 1, orderBy: { createdAt: "asc" } } },
  });

  if (!user || !user.isActive) {
    await recordLoginEvent({ email, success: false, reason: "unknown_user" });
    return NextResponse.json({ error: "Identifiants invalides." }, { status: 401 });
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    await recordLoginEvent({ email, success: false, reason: "wrong_password", userId: user.id });
    return NextResponse.json({ error: "Identifiants invalides." }, { status: 401 });
  }

  await createSession(user.id);
  await recordLoginEvent({
    email,
    success: true,
    userId: user.id,
    organizationId: user.memberships[0]?.organizationId,
  });
  if (user.memberships[0]?.organizationId) {
    await publishAutomationEvent("user.logged_in", { organizationId: user.memberships[0].organizationId, userId: user.id });
  }

  return NextResponse.json({ ok: true });
}
