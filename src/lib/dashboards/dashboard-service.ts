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

/**
 * Tableau de bord Planning (v1.1, AR-0176) — charge par technicien
 * (missions actives), rendez-vous à venir, visites 3D programmées sur les
 * 7 prochains jours. Absent jusqu'ici : seul un KPI "rendez-vous" isolé
 * existait dans `getAppointmentsDashboard` (agrégats globaux, jamais une
 * vue agenda).
 */
export async function getPlanningDashboard(organizationId: string) {
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [providers, upcomingAppointments, toursThisWeek] = await Promise.all([
    prisma.provider.findMany({
      where: { organizationId, isActive: true },
      include: { _count: { select: { missions: { where: { status: { in: ["ACCEPTED", "IN_PROGRESS"] } } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.appointment.findMany({
      where: { organizationId, status: "SCHEDULED", startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: 10,
      include: { lead: { select: { establishmentName: true } } },
    }),
    prisma.virtualTour.findMany({
      where: { organizationId, scheduledAt: { gte: now, lte: weekEnd } },
      orderBy: { scheduledAt: "asc" },
      include: { lead: { select: { establishmentName: true } } },
    }),
  ]);

  return {
    providerLoad: providers.map((p) => ({ id: p.id, name: p.name, activeMissionsCount: p._count.missions })),
    upcomingAppointments: upcomingAppointments.map((a) => ({
      id: a.id,
      title: a.title,
      startAt: a.startAt,
      leadEstablishmentName: a.lead.establishmentName,
    })),
    toursThisWeek: toursThisWeek.map((t) => ({
      id: t.id,
      scheduledAt: t.scheduledAt,
      status: t.status,
      leadEstablishmentName: t.lead.establishmentName,
    })),
  };
}

/**
 * Tableau de bord Financier (v1.1, AR-0177) — CA réellement encaissé dans
 * le temps (factures `PAID`, jamais l'estimation d'opportunité déjà
 * utilisée par `/dashboard`), factures en attente/en retard (repose sur
 * `processOverdueInvoices`, AR-0169), devis en cours, prévisionnel simple
 * (CA encaissé + devis acceptés pas encore facturés).
 */
export async function getFinancialDashboard(organizationId: string) {
  const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const [paidInvoices, pendingInvoices, overdueInvoices, quotesInProgress, quotesAcceptedNotInvoiced] = await Promise.all([
    prisma.invoice.findMany({
      where: { organizationId, status: "PAID", paidAt: { gte: twelveMonthsAgo } },
      select: { totalAmount: true, paidAt: true },
    }),
    prisma.invoice.aggregate({ where: { organizationId, status: "SENT" }, _sum: { totalAmount: true }, _count: { _all: true } }),
    prisma.invoice.aggregate({ where: { organizationId, status: "OVERDUE" }, _sum: { totalAmount: true }, _count: { _all: true } }),
    prisma.quote.aggregate({ where: { organizationId, status: "SENT" }, _sum: { totalAmount: true }, _count: { _all: true } }),
    prisma.quote.aggregate({
      where: { organizationId, status: "ACCEPTED", invoices: { none: {} } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
  ]);

  const revenueByMonth = new Map<string, number>();
  for (const invoice of paidInvoices) {
    if (!invoice.paidAt) continue;
    const key = `${invoice.paidAt.getFullYear()}-${String(invoice.paidAt.getMonth() + 1).padStart(2, "0")}`;
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + invoice.totalAmount);
  }
  const totalRevenue = paidInvoices.reduce((sum, i) => sum + i.totalAmount, 0);
  const forecastedRevenue = totalRevenue + (quotesAcceptedNotInvoiced._sum.totalAmount ?? 0);

  return {
    totalRevenue,
    revenueByMonth: Array.from(revenueByMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount })),
    pendingInvoices: { count: pendingInvoices._count._all, totalAmount: pendingInvoices._sum.totalAmount ?? 0 },
    overdueInvoices: { count: overdueInvoices._count._all, totalAmount: overdueInvoices._sum.totalAmount ?? 0 },
    quotesInProgress: { count: quotesInProgress._count._all, totalAmount: quotesInProgress._sum.totalAmount ?? 0 },
    forecastedRevenue,
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
