import "server-only";
import { prisma } from "@/lib/prisma";
import { isNotificationEnabled } from "@/lib/settings/notification-preferences-service";
import { NotificationChannel } from "@/generated/prisma/enums";
import type { CurrentActor } from "@/lib/auth";

/**
 * Point d'entrée central pour les notifications applicatives (v1.4,
 * AR-0184) — jusqu'ici, chaque appelant (Automation/Workflow Engine, agents)
 * appelait `prisma.notification.create` directement, avec sa propre logique
 * de vérification de préférence dupliquée ; ce module ne remplace PAS ces
 * appels existants (fonctionnels, testés, pas de régression à risquer) mais
 * devient le point d'entrée pour tout NOUVEAU code (invitations, quotas,
 * administration).
 */
export async function createNotification(params: {
  organizationId: string;
  userId?: string | null;
  type: string;
  title: string;
  body?: string;
  link?: string;
}) {
  if (params.userId) {
    const enabled = await isNotificationEnabled(params.userId, params.type, NotificationChannel.APP);
    if (!enabled) return null;
  }
  return prisma.notification.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId ?? undefined,
      type: params.type,
      title: params.title,
      body: params.body,
      link: params.link,
    },
  });
}

/** Diffusion large (toute l'organisation, pas un utilisateur précis) — jamais soumise aux préférences individuelles. */
export async function broadcastNotification(params: { organizationId: string; type: string; title: string; body?: string; link?: string }) {
  return createNotification({ ...params, userId: null });
}

/** Liste les notifications visibles par l'acteur — les siennes ET les diffusions larges de son organisation. */
export async function listNotifications(actor: Pick<CurrentActor, "organization" | "user">, opts: { limit?: number; unreadOnly?: boolean } = {}) {
  return prisma.notification.findMany({
    where: {
      organizationId: actor.organization.id,
      OR: [{ userId: actor.user.id }, { userId: null }],
      ...(opts.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 20,
  });
}

export async function countUnreadNotifications(actor: Pick<CurrentActor, "organization" | "user">): Promise<number> {
  return prisma.notification.count({
    where: { organizationId: actor.organization.id, OR: [{ userId: actor.user.id }, { userId: null }], readAt: null },
  });
}

/** Marque comme lue — STRICTEMENT scopée à l'organisation ET (l'utilisateur OU une diffusion large) de l'acteur, jamais la notification d'un autre tenant/utilisateur. */
export async function markNotificationRead(actor: Pick<CurrentActor, "organization" | "user">, notificationId: string) {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, organizationId: actor.organization.id, OR: [{ userId: actor.user.id }, { userId: null }], readAt: null },
    data: { readAt: new Date() },
  });
  return result.count > 0;
}

export async function markAllNotificationsRead(actor: Pick<CurrentActor, "organization" | "user">) {
  const result = await prisma.notification.updateMany({
    where: { organizationId: actor.organization.id, OR: [{ userId: actor.user.id }, { userId: null }], readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

/**
 * Notifie une seule fois par organisation/dimension/24h qu'un quota approche
 * ou atteint sa limite (v1.4, AR-0184) — dédoublonnage par recherche d'une
 * notification RÉCENTE de même type plutôt qu'un état séparé à maintenir.
 */
export async function notifyQuotaWarningOnce(organizationId: string, dimension: string, message: string) {
  const type = `quota_warning:${dimension}`;
  const recent = await prisma.notification.findFirst({
    where: { organizationId, type, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  if (recent) return null;
  return broadcastNotification({ organizationId, type, title: "Quota bientôt atteint", body: message, link: "/settings/billing" });
}
