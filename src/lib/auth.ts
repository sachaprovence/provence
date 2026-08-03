import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { MembershipRole } from "@/generated/prisma/enums";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { TooManyRequestsError } from "@/lib/errors";

export { SESSION_COOKIE };
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 jours
const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_MAX_FAILURES = 8;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function createSession(userId: string) {
  const token = generateToken();
  const hdrs = await headers();
  const session = await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      userAgent: hdrs.get("user-agent") ?? undefined,
      ipAddress: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    },
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
  return session;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

export type CurrentActor = {
  user: { id: string; email: string; firstName: string; lastName: string };
  membership: { id: string; role: MembershipRole; territoryId: string | null };
  organization: { id: string; name: string };
  // Identifiant de la session en cours — nécessaire pour résoudre/mettre à
  // jour le workspace actif (voir src/lib/workspace-context.ts). Additif :
  // ne casse aucun code existant qui ne lit que user/membership/organization.
  sessionId: string;
};

export async function getCurrentActor(): Promise<CurrentActor | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          memberships: { include: { organization: true }, take: 1, orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    return null;
  }

  const membership = session.user.memberships[0];
  if (!membership) return null;

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
    },
    membership: {
      id: membership.id,
      role: membership.role,
      territoryId: membership.territoryId,
    },
    organization: { id: membership.organization.id, name: membership.organization.name },
    sessionId: session.id,
  };
}

export async function requireActor(): Promise<CurrentActor> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  return actor;
}

export async function requireRole(roles: MembershipRole[]): Promise<CurrentActor> {
  const actor = await requireActor();
  if (!roles.includes(actor.membership.role)) {
    redirect("/dashboard?error=forbidden");
  }
  return actor;
}

/**
 * Verrouillage de compte durable (v0.10, AR-0155) — repose sur `LoginEvent`
 * (Postgres, déjà journalisé depuis v0.1, partagé entre toutes les
 * instances de l'application), pas un compteur en mémoire par processus.
 * Corrige un manque réel : chaque tentative échouée était déjà
 * journalisée mais rien ne la relisait jamais pour bloquer un compte —
 * la connexion était intégralement force-brutable. Bloque explicitement
 * après `LOGIN_LOCKOUT_MAX_FAILURES` échecs dans la fenêtre glissante,
 * jamais un simple avertissement.
 */
export async function assertLoginNotLocked(email: string): Promise<void> {
  const since = new Date(Date.now() - LOGIN_LOCKOUT_WINDOW_MS);
  const recentFailures = await prisma.loginEvent.count({
    where: { email, success: false, createdAt: { gte: since } },
  });
  if (recentFailures >= LOGIN_LOCKOUT_MAX_FAILURES) {
    throw new TooManyRequestsError("Trop de tentatives de connexion. Réessayez dans quelques minutes.");
  }
}

export async function recordLoginEvent(params: {
  email: string;
  success: boolean;
  reason?: string;
  organizationId?: string;
  userId?: string;
}) {
  const hdrs = await headers();
  await prisma.loginEvent.create({
    data: {
      email: params.email,
      success: params.success,
      reason: params.reason,
      organizationId: params.organizationId,
      userId: params.userId,
      ipAddress: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: hdrs.get("user-agent") ?? undefined,
    },
  });
}
