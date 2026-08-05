import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { computeOrganizationUsage } from "@/lib/billing/usage-service";
import { PlanKey, SubscriptionStatus } from "@/generated/prisma/enums";
import type { CurrentActor } from "@/lib/auth";

/**
 * Administration PLATEFORME (v1.4, AR-0185) — traverse TOUTES les
 * organisations, contrairement à tout le reste de l'application (toujours
 * scopé à `actor.organization.id`). Accessible uniquement derrière
 * `requirePlatformAdminPage`/`requirePlatformAdminApi` (voir
 * `platform-admin.ts`) — jamais appelé sans cette vérification préalable.
 * Réutilise `SubscriptionStatus.RESTRICTED` (déjà existant, v1.0) pour
 * suspendre une organisation plutôt que d'inventer un nouveau statut :
 * même sémantique qu'un échec de paiement (écriture bloquée, lecture
 * toujours possible), voir `src/proxy.ts`.
 */

export async function listOrganizationsForAdmin(opts: { search?: string; limit?: number } = {}) {
  const organizations = await prisma.organization.findMany({
    where: opts.search ? { name: { contains: opts.search, mode: "insensitive" } } : undefined,
    include: { plan: true, _count: { select: { memberships: true } } },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 50,
  });
  return organizations.map((org) => ({
    id: org.id,
    name: org.name,
    planName: org.plan?.name ?? null,
    subscriptionStatus: org.subscriptionStatus,
    memberCount: org._count.memberships,
    createdAt: org.createdAt,
  }));
}

export async function listUsersForAdmin(opts: { search?: string; limit?: number } = {}) {
  const users = await prisma.user.findMany({
    where: opts.search ? { email: { contains: opts.search, mode: "insensitive" } } : undefined,
    include: { memberships: { include: { organization: true } } },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 50,
  });
  return users.map((user) => ({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isActive: user.isActive,
    isPlatformAdmin: user.isPlatformAdmin,
    organizations: user.memberships.map((m) => ({ id: m.organization.id, name: m.organization.name, role: m.role })),
    createdAt: user.createdAt,
  }));
}

export async function getOrganizationDetailForAdmin(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { plan: true, memberships: { include: { user: true } } },
  });
  if (!organization) throw new NotFoundError("Organisation introuvable.");

  const usage = await computeOrganizationUsage(organizationId);
  return {
    id: organization.id,
    name: organization.name,
    subscriptionStatus: organization.subscriptionStatus,
    plan: organization.plan,
    createdAt: organization.createdAt,
    members: organization.memberships.map((m) => ({
      id: m.id,
      role: m.role,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      isActive: m.user.isActive,
    })),
    usage,
  };
}

export async function changeOrganizationPlanAsAdmin(actor: CurrentActor, organizationId: string, planKey: PlanKey) {
  const plan = await prisma.plan.findUnique({ where: { key: planKey } });
  if (!plan) throw new NotFoundError(`Plan "${planKey}" introuvable.`);

  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: { planId: plan.id, dailySendLimit: plan.dailySendLimit, aiMonthlyBudgetUsd: plan.aiMonthlyBudgetUsd },
  });

  await writeAuditLog({
    organizationId,
    userId: actor.user.id,
    action: "admin.organization_plan_changed",
    entityType: "Organization",
    entityId: organizationId,
    metadata: { planKey, byPlatformAdmin: actor.user.id },
  });

  return updated;
}

export async function suspendOrganizationAsAdmin(actor: CurrentActor, organizationId: string) {
  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: { subscriptionStatus: SubscriptionStatus.RESTRICTED },
  });

  await writeAuditLog({
    organizationId,
    userId: actor.user.id,
    action: "admin.organization_suspended",
    entityType: "Organization",
    entityId: organizationId,
    metadata: { byPlatformAdmin: actor.user.id },
  });

  return updated;
}

export async function reactivateOrganizationAsAdmin(actor: CurrentActor, organizationId: string) {
  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: { subscriptionStatus: SubscriptionStatus.ACTIVE },
  });

  await writeAuditLog({
    organizationId,
    userId: actor.user.id,
    action: "admin.organization_reactivated",
    entityType: "Organization",
    entityId: organizationId,
    metadata: { byPlatformAdmin: actor.user.id },
  });

  return updated;
}

/** Journaux d'audit à travers TOUTES les organisations (jamais accessible ailleurs que via l'admin plateforme). */
export async function listAuditLogsForAdmin(opts: { organizationId?: string; limit?: number } = {}) {
  return prisma.auditLog.findMany({
    where: opts.organizationId ? { organizationId: opts.organizationId } : undefined,
    include: { user: true, organization: true },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 100,
  });
}

/** Taux d'erreur API global (toutes organisations confondues) — réutilise `ApiRequestMetric` (v1.3, AR-0174), déjà collecté, jamais agrégé au-delà d'une organisation ailleurs que dans cette vue admin. */
export async function getGlobalErrorSummary(sinceDays = 7) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const [total, errors] = await Promise.all([
    prisma.apiRequestMetric.count({ where: { createdAt: { gte: since } } }),
    prisma.apiRequestMetric.count({ where: { createdAt: { gte: since }, statusCode: { gte: 500 } } }),
  ]);
  return { total, errors, errorRate: total > 0 ? errors / total : 0 };
}

export async function getPlatformOverview() {
  const [organizationCount, userCount, byStatus] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.organization.groupBy({ by: ["subscriptionStatus"], _count: { _all: true } }),
  ]);
  return {
    organizationCount,
    userCount,
    byStatus: byStatus.map((row) => ({ status: row.subscriptionStatus, count: row._count._all })),
  };
}
