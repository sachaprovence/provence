import "server-only";
import { prisma } from "@/lib/prisma";
import { QuotaExceededError } from "@/lib/errors";

/**
 * Quota email quotidien dur par organisation (v0.10, AR-0057) — généralise
 * `Organization.dailySendLimit` (déjà bloquant, mais seulement à
 * l'intérieur de `sequence-engine.ts`) à TOUS les points d'envoi réel de
 * l'application, y compris le Workflow Engine et l'Automation Engine (qui
 * pouvaient jusqu'ici envoyer un nombre illimité d'emails via leur action
 * `email.send`, sans aucune vérification de quota). Un `EmailAccount` actif
 * peut définir sa propre limite (`dailyLimit`), sinon celle de
 * l'organisation (`dailySendLimit`) s'applique — même règle de priorité
 * que le comportement historique de `sequence-engine.ts`.
 */
function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function getEmailSentTodayCount(organizationId: string): Promise<number> {
  return prisma.message.count({
    where: {
      lead: { organizationId },
      status: "SENT",
      sentAt: { gte: startOfToday() },
    },
  });
}

export async function resolveDailyEmailLimit(organizationId: string): Promise<number> {
  const [emailAccount, organization] = await Promise.all([
    prisma.emailAccount.findFirst({ where: { organizationId, isActive: true } }),
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { dailySendLimit: true } }),
  ]);
  return emailAccount?.dailyLimit ?? organization.dailySendLimit;
}

/** Lève `QuotaExceededError` si l'organisation a atteint sa limite d'envoi email du jour — jamais un simple avertissement. */
export async function assertEmailQuotaAvailable(organizationId: string): Promise<void> {
  const [sentToday, limit] = await Promise.all([
    getEmailSentTodayCount(organizationId),
    resolveDailyEmailLimit(organizationId),
  ]);
  if (sentToday >= limit) {
    throw new QuotaExceededError(
      `Quota d'envoi email quotidien atteint pour cette organisation (${sentToday}/${limit}).`,
      { sentToday, limit }
    );
  }
}
