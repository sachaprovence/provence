import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { PlanKey } from "@/generated/prisma/enums";

/**
 * Plans d'abonnement SaaS Autorun (v1.0, AR-0062) — les quotas d'un plan
 * (`dailySendLimit`/`aiMonthlyBudgetUsd`) sont COPIÉS sur `Organization`
 * quand le plan est (ré)appliqué, plutôt que résolus indirectement à
 * chaque vérification de quota : tout le code d'application des quotas
 * déjà existant (`sequence-engine.ts`, `src/lib/ai/quota.ts`,
 * `src/lib/email/quota.ts`) continue de lire `Organization.dailySendLimit`/
 * `aiMonthlyBudgetUsd` sans jamais avoir à connaître la notion de plan.
 */

export async function listPlans() {
  return prisma.plan.findMany({ orderBy: { priceMonthlyUsd: "asc" } });
}

export async function getPlanByKey(key: PlanKey) {
  const plan = await prisma.plan.findUnique({ where: { key } });
  if (!plan) throw new NotFoundError(`Plan "${key}" introuvable.`);
  return plan;
}

/** Copie les quotas du plan sur l'organisation et enregistre le plan actif — jamais une deuxième source de vérité pour les quotas. */
export async function applyPlanToOrganization(organizationId: string, planKey: PlanKey) {
  const plan = await getPlanByKey(planKey);
  return prisma.organization.update({
    where: { id: organizationId },
    data: {
      planId: plan.id,
      dailySendLimit: plan.dailySendLimit,
      aiMonthlyBudgetUsd: plan.aiMonthlyBudgetUsd,
    },
  });
}

/** Nombre de membres actuels de l'organisation (mêmes utilisateurs comptés une fois, indépendamment du nombre de workspaces). */
export async function countOrganizationMembers(organizationId: string): Promise<number> {
  return prisma.membership.count({ where: { organizationId } });
}

/**
 * Lève `ConflictError` si ajouter un membre dépasserait `Plan.maxUsers` —
 * appelé à chaque point réel de création d'une nouvelle `Membership`
 * (invitation directe, acceptation d'invitation de workspace). Une
 * organisation sans plan (`planId` null) n'est jamais bloquée — comportement
 * additif, cohérent avec `Organization.aiMonthlyBudgetUsd` (`null` =
 * illimité).
 */
export async function assertMemberLimitAvailable(organizationId: string): Promise<void> {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    include: { plan: true },
  });
  if (!organization.plan) return;

  const currentMembers = await countOrganizationMembers(organizationId);
  if (currentMembers >= organization.plan.maxUsers) {
    throw new ConflictError(
      `Limite de ${organization.plan.maxUsers} utilisateur(s) du plan "${organization.plan.name}" atteinte. Passez à un plan supérieur pour inviter davantage de membres.`
    );
  }
}
