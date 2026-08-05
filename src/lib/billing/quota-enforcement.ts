import "server-only";
import { prisma } from "@/lib/prisma";
import { QuotaExceededError } from "@/lib/errors";
import { notifyQuotaWarningOnce } from "@/lib/notifications/notification-service";

const WARNING_RATIO = 0.8;

/**
 * Points d'application des limites de plan (v1.4, AR-0183) — chaque
 * fonction lève `QuotaExceededError` (déjà existante, réutilisée telle
 * quelle, même sémantique que les quotas IA/email déjà en place) UNIQUEMENT
 * au point de création réel, jamais en amont par une vérification
 * spéculative qui pourrait devenir fausse entre-temps (cohérent avec
 * `assertMemberLimitAvailable`, `plan-service.ts`).
 */
const AUTOMATION_RUN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function assertAutomationRunAllowed(organizationId: string): Promise<void> {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, include: { plan: true } });
  const limit = organization.plan?.maxAutomationRuns;
  if (limit == null) return;

  const count = await prisma.automationRun.count({ where: { organizationId, createdAt: { gte: new Date(Date.now() - AUTOMATION_RUN_WINDOW_MS) } } });
  if (count >= limit) {
    throw new QuotaExceededError(
      `Limite de ${limit} exécution(s) d'automatisation/30 jours du plan "${organization.plan?.name}" atteinte. Passez à un plan supérieur pour continuer.`
    );
  }
  if (count >= limit * WARNING_RATIO) {
    await notifyQuotaWarningOnce(
      organizationId,
      "automation_runs",
      `${count}/${limit} exécutions d'automatisation utilisées ce mois-ci (plan "${organization.plan?.name}").`
    );
  }
}

export async function assertStorageAvailable(organizationId: string, additionalBytes: number): Promise<void> {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, include: { plan: true } });
  const limitMb = organization.plan?.maxStorageMb;
  if (limitMb == null) return;

  const agg = await prisma.attachment.aggregate({ where: { organizationId }, _sum: { sizeBytes: true } });
  const usedMb = (agg._sum.sizeBytes ?? 0) / (1024 * 1024);
  const additionalMb = additionalBytes / (1024 * 1024);
  if (usedMb + additionalMb > limitMb) {
    throw new QuotaExceededError(
      `Limite de stockage de ${limitMb} Mo du plan "${organization.plan?.name}" atteinte. Passez à un plan supérieur ou supprimez des pièces jointes.`
    );
  }
  if (usedMb + additionalMb >= limitMb * WARNING_RATIO) {
    await notifyQuotaWarningOnce(
      organizationId,
      "storage",
      `${Math.round(usedMb + additionalMb)}/${limitMb} Mo de stockage utilisés (plan "${organization.plan?.name}").`
    );
  }
}

/** `newKind` : le type de connecteur qu'on est en train de configurer — un ré-enregistrement du MÊME type déjà configuré n'ajoute jamais de connecteur. */
export async function assertConnectorLimitAvailable(organizationId: string, newKind: string): Promise<void> {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, include: { plan: true } });
  const limit = organization.plan?.maxConnectors;
  if (limit == null) return;

  const existing = await prisma.integration.findMany({
    where: { organizationId, status: { not: "DEMO" } },
    distinct: ["kind"],
    select: { kind: true },
  });
  const alreadyConfigured = existing.some((i) => i.kind === newKind);
  if (alreadyConfigured) return;

  if (existing.length >= limit) {
    throw new QuotaExceededError(
      `Limite de ${limit} connecteur(s) du plan "${organization.plan?.name}" atteinte. Passez à un plan supérieur pour connecter un nouvel outil.`
    );
  }
}
