import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Tableaux de bord additionnels (brief v0.9 : "Créer plusieurs dashboards
 * — Commercial, Production, Clients, Visites, CA, Activité IA,
 * Automatisations, Rendez-vous, Performance"). Commercial/CA sont déjà
 * couverts par `/dashboard` (`src/lib/stats.ts`) et Automatisations par
 * `/automations` (v0.8, `src/lib/automation/dashboard-service.ts`) — ce
 * module ajoute les six dashboards encore manquants, en agrégations
 * ciblées (COUNT/groupBy), jamais un recalcul de ce qui existe déjà.
 */

export async function getProductionDashboard(organizationId: string) {
  const [byStatus, missions, providers] = await Promise.all([
    prisma.mission.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
    prisma.mission.findMany({
      where: { organizationId, status: "DELIVERED" },
      select: { createdAt: true, updatedAt: true },
    }),
    prisma.provider.findMany({
      where: { organizationId, isActive: true },
      include: { _count: { select: { missions: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const turnaroundDaysList = missions.map((m) => (m.updatedAt.getTime() - m.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  const avgTurnaroundDays = turnaroundDaysList.length > 0 ? turnaroundDaysList.reduce((a, b) => a + b, 0) / turnaroundDaysList.length : 0;

  return {
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
    avgTurnaroundDays: Math.round(avgTurnaroundDays * 10) / 10,
    providers: providers.map((p) => ({ id: p.id, name: p.name, missionsCount: p._count.missions })),
  };
}

export async function getClientsDashboard(organizationId: string) {
  const customers = await prisma.customer.findMany({
    where: { organizationId },
    include: { lead: { select: { establishmentName: true, category: true } } },
    orderBy: { lifetimeValue: "desc" },
  });

  const totalLifetimeValue = customers.reduce((sum, c) => sum + c.lifetimeValue, 0);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  return {
    totalCustomers: customers.length,
    newCustomersLast30Days: customers.filter((c) => c.wonAt >= thirtyDaysAgo).length,
    totalLifetimeValue,
    averageLifetimeValue: customers.length > 0 ? Math.round(totalLifetimeValue / customers.length) : 0,
    topCustomers: customers.slice(0, 10).map((c) => ({
      id: c.id,
      establishmentName: c.lead.establishmentName,
      category: c.lead.category,
      lifetimeValue: c.lifetimeValue,
      wonAt: c.wonAt,
    })),
  };
}

export async function getVisitsDashboard(organizationId: string) {
  const [byStatus, tours] = await Promise.all([
    prisma.virtualTour.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
    prisma.virtualTour.findMany({ where: { organizationId }, select: { status: true, surfaceM2: true } }),
  ]);

  const total = tours.length;
  const published = tours.filter((t) => t.status === "PUBLISHED").length;
  const surfaces = tours.map((t) => t.surfaceM2).filter((s): s is number => s !== null);

  return {
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
    total,
    publishedRate: total > 0 ? Math.round((published / total) * 100) : 0,
    averageSurfaceM2: surfaces.length > 0 ? Math.round(surfaces.reduce((a, b) => a + b, 0) / surfaces.length) : 0,
  };
}

export async function getAppointmentsDashboard(organizationId: string) {
  const now = new Date();
  const [byStatus, upcoming, completed, noShow, total] = await Promise.all([
    prisma.appointment.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
    prisma.appointment.count({ where: { organizationId, startAt: { gte: now }, status: "SCHEDULED" } }),
    prisma.appointment.count({ where: { organizationId, status: "COMPLETED" } }),
    prisma.appointment.count({ where: { organizationId, status: "NO_SHOW" } }),
    prisma.appointment.count({ where: { organizationId } }),
  ]);

  return {
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
    upcomingCount: upcoming,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    noShowRate: total > 0 ? Math.round((noShow / total) * 100) : 0,
    total,
  };
}

export async function getAiActivityDashboard(organizationId: string) {
  const [byKind, byProvider, byStatus, costAgg, recentErrors] = await Promise.all([
    prisma.aIRequest.groupBy({ by: ["kind"], where: { organizationId }, _count: { _all: true } }),
    prisma.aIRequest.groupBy({ by: ["provider"], where: { organizationId }, _count: { _all: true }, _sum: { estimatedCostUsd: true } }),
    prisma.aIRequest.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
    prisma.aIRequest.aggregate({ where: { organizationId }, _sum: { estimatedCostUsd: true }, _count: { _all: true } }),
    prisma.aIRequest.findMany({
      where: { organizationId, status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, kind: true, provider: true, createdAt: true },
    }),
  ]);

  return {
    totalRequests: costAgg._count._all,
    totalEstimatedCostUsd: costAgg._sum.estimatedCostUsd ?? 0,
    byKind: byKind.map((k) => ({ kind: k.kind, count: k._count._all })),
    byProvider: byProvider.map((p) => ({ provider: p.provider, count: p._count._all, estimatedCostUsd: p._sum.estimatedCostUsd ?? 0 })),
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
    recentErrors,
  };
}

export async function getPerformanceDashboard(organizationId: string) {
  const users = await prisma.membership.findMany({
    where: { organizationId },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  });

  const performance = await Promise.all(
    users.map(async (membership) => {
      const userId = membership.user.id;
      const [leadsAssigned, appointmentsOwned, quotesSent, quotesWon] = await Promise.all([
        prisma.lead.count({ where: { organizationId, assignedToId: userId } }),
        prisma.appointment.count({ where: { organizationId, ownerId: userId } }),
        prisma.message.count({ where: { lead: { organizationId }, validatedById: userId, status: "SENT" } }),
        prisma.quote.count({ where: { organizationId, status: "ACCEPTED", lead: { assignedToId: userId } } }),
      ]);
      return {
        userId,
        name: `${membership.user.firstName} ${membership.user.lastName}`,
        leadsAssigned,
        appointmentsOwned,
        quotesSent,
        quotesWon,
      };
    })
  );

  return { performance: performance.sort((a, b) => b.quotesWon - a.quotesWon) };
}
