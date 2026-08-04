import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getProductionDashboard,
  getClientsDashboard,
  getVisitsDashboard,
  getAppointmentsDashboard,
  getAiActivityDashboard,
  getPerformanceDashboard,
  getPlanningDashboard,
  getFinancialDashboard,
} from "@/lib/dashboards/dashboard-service";
import {
  MissionStatus,
  AppointmentStatus,
  VirtualTourStatus,
  AIRequestKind,
  AIRequestStatus,
  MembershipRole,
  InvoiceStatus,
  QuoteStatus,
} from "@/generated/prisma/enums";

/**
 * Dashboards v0.9 (ADR 0038) : Production/Clients/Visites/Rendez-vous/
 * Activité IA/Performance — les six dashboards du brief non déjà couverts
 * par `/dashboard` (Commercial/CA) et `/automations` (Automatisations).
 * Planning (AR-0176) et Financier (AR-0177) ajoutés en v1.1. Vérifie les
 * agrégations clés et l'isolation multi-tenant.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Dashboards v0.9 — Production/Clients/Visites/RDV/IA/Performance", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  async function createOrg(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org dashboard ${suffix}` } });
    organizationIds.push(organization.id);
    return organization;
  }

  it("Production : ventile les missions par statut et calcule le délai moyen de livraison", async () => {
    const organization = await createOrg("production");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, leadId: lead.id } });
    const provider = await prisma.provider.create({ data: { organizationId: organization.id, name: "Prestataire A", email: "p@example.test" } });

    await prisma.mission.create({
      data: { organizationId: organization.id, customerId: customer.id, providerId: provider.id, title: "M1", status: MissionStatus.DELIVERED },
    });
    await prisma.mission.create({ data: { organizationId: organization.id, customerId: customer.id, title: "M2", status: MissionStatus.IN_PROGRESS } });

    const dashboard = await getProductionDashboard(organization.id);
    expect(dashboard.byStatus.find((s) => s.status === "DELIVERED")?.count).toBe(1);
    expect(dashboard.byStatus.find((s) => s.status === "IN_PROGRESS")?.count).toBe(1);
    expect(dashboard.avgTurnaroundDays).toBeGreaterThanOrEqual(0);
    expect(dashboard.providers.find((p) => p.id === provider.id)?.missionsCount).toBe(1);
  });

  it("Clients : agrège la valeur vie et classe les meilleurs clients", async () => {
    const organization = await createOrg("clients");
    const leadA = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client A" } });
    const leadB = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client B" } });
    await prisma.customer.create({ data: { organizationId: organization.id, leadId: leadA.id, lifetimeValue: 100000 } });
    await prisma.customer.create({ data: { organizationId: organization.id, leadId: leadB.id, lifetimeValue: 50000 } });

    const dashboard = await getClientsDashboard(organization.id);
    expect(dashboard.totalCustomers).toBe(2);
    expect(dashboard.totalLifetimeValue).toBe(150000);
    expect(dashboard.averageLifetimeValue).toBe(75000);
    expect(dashboard.topCustomers[0].establishmentName).toBe("Client A");
  });

  it("Visites 3D : calcule le taux de publication et la surface moyenne", async () => {
    const organization = await createOrg("visits");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, leadId: lead.id } });
    const mission = await prisma.mission.create({ data: { organizationId: organization.id, customerId: customer.id, title: "M1" } });

    await prisma.virtualTour.create({ data: { organizationId: organization.id, leadId: lead.id, missionId: mission.id, status: VirtualTourStatus.PUBLISHED, surfaceM2: 100 } });
    await prisma.virtualTour.create({ data: { organizationId: organization.id, leadId: lead.id, missionId: mission.id, status: VirtualTourStatus.DRAFT, surfaceM2: 200 } });

    const dashboard = await getVisitsDashboard(organization.id);
    expect(dashboard.total).toBe(2);
    expect(dashboard.publishedRate).toBe(50);
    expect(dashboard.averageSurfaceM2).toBe(150);
  });

  it("Rendez-vous : calcule les taux de réalisation et d'absence", async () => {
    const organization = await createOrg("appointments");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client" } });

    await prisma.appointment.create({
      data: { organizationId: organization.id, leadId: lead.id, title: "RDV 1", startAt: new Date(), endAt: new Date(), status: AppointmentStatus.COMPLETED },
    });
    await prisma.appointment.create({
      data: { organizationId: organization.id, leadId: lead.id, title: "RDV 2", startAt: new Date(), endAt: new Date(), status: AppointmentStatus.NO_SHOW },
    });
    await prisma.appointment.create({
      data: { organizationId: organization.id, leadId: lead.id, title: "RDV 3", startAt: new Date(Date.now() + 86400000), endAt: new Date(Date.now() + 90000000), status: AppointmentStatus.SCHEDULED },
    });

    const dashboard = await getAppointmentsDashboard(organization.id);
    expect(dashboard.total).toBe(3);
    expect(dashboard.completionRate).toBe(33);
    expect(dashboard.noShowRate).toBe(33);
    expect(dashboard.upcomingCount).toBe(1);
  });

  it("Activité IA : agrège coût, statut et fournisseur", async () => {
    const organization = await createOrg("ai");
    await prisma.aIRequest.create({
      data: { organizationId: organization.id, kind: AIRequestKind.ANALYZE_LEAD, provider: "demo", model: "demo-1", prompt: "p", response: "r", estimatedCostUsd: 0.5, status: AIRequestStatus.COMPLETED },
    });
    await prisma.aIRequest.create({
      data: { organizationId: organization.id, kind: AIRequestKind.ANALYZE_LEAD, provider: "demo", model: "demo-1", prompt: "p", response: "", estimatedCostUsd: 0, status: AIRequestStatus.FAILED },
    });

    const dashboard = await getAiActivityDashboard(organization.id);
    expect(dashboard.totalRequests).toBe(2);
    expect(dashboard.totalEstimatedCostUsd).toBeCloseTo(0.5);
    expect(dashboard.byStatus.find((s) => s.status === "FAILED")?.count).toBe(1);
    expect(dashboard.recentErrors).toHaveLength(1);
  });

  it("Performance : agrège prospects assignés et rendez-vous par membre", async () => {
    const organization = await createOrg("performance");
    const user = await prisma.user.create({
      data: { email: `perf-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Alice", lastName: "Test" },
    });
    await prisma.membership.create({ data: { organizationId: organization.id, userId: user.id, role: MembershipRole.SALES } });
    await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client", assignedToId: user.id } });

    const dashboard = await getPerformanceDashboard(organization.id);
    const entry = dashboard.performance.find((p) => p.userId === user.id);
    expect(entry?.leadsAssigned).toBe(1);
    expect(entry?.name).toBe("Alice Test");
  });

  it("Planning (v1.1, AR-0176) : charge par technicien, rendez-vous à venir, visites de la semaine", async () => {
    const organization = await createOrg("planning");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client planning" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, leadId: lead.id } });
    const provider = await prisma.provider.create({ data: { organizationId: organization.id, name: "Technicien A", email: "tech@example.test" } });
    await prisma.mission.create({
      data: { organizationId: organization.id, customerId: customer.id, providerId: provider.id, title: "M1", status: MissionStatus.IN_PROGRESS },
    });
    await prisma.mission.create({
      data: { organizationId: organization.id, customerId: customer.id, providerId: provider.id, title: "M2 déclinée", status: MissionStatus.DECLINED },
    });

    await prisma.appointment.create({
      data: {
        organizationId: organization.id,
        leadId: lead.id,
        title: "RDV à venir",
        startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        endAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 3600000),
        status: AppointmentStatus.SCHEDULED,
      },
    });

    const mission = await prisma.mission.findFirstOrThrow({ where: { organizationId: organization.id, status: MissionStatus.IN_PROGRESS } });
    const tourThisWeek = await prisma.virtualTour.create({
      data: {
        organizationId: organization.id,
        leadId: lead.id,
        missionId: mission.id,
        scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.virtualTour.create({
      data: {
        organizationId: organization.id,
        leadId: lead.id,
        missionId: mission.id,
        scheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // hors fenêtre 7 jours
      },
    });

    const dashboard = await getPlanningDashboard(organization.id);
    expect(dashboard.providerLoad.find((p) => p.id === provider.id)?.activeMissionsCount).toBe(1); // DECLINED exclue
    expect(dashboard.upcomingAppointments).toHaveLength(1);
    expect(dashboard.upcomingAppointments[0].leadEstablishmentName).toBe("Client planning");
    const tourIds = dashboard.toursThisWeek.map((t) => t.id);
    expect(tourIds).toContain(tourThisWeek.id);
    expect(tourIds).toHaveLength(1);
  });

  it("Financier (v1.1, AR-0177) : CA encaissé, factures en attente/en retard, devis en cours, prévisionnel", async () => {
    const organization = await createOrg("financial");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client financier" } });

    await prisma.invoice.create({
      data: {
        organizationId: organization.id,
        leadId: lead.id,
        reference: "FA-PAID-1",
        status: InvoiceStatus.PAID,
        totalAmount: 100000,
        paidAt: new Date(),
      },
    });
    await prisma.invoice.create({
      data: { organizationId: organization.id, leadId: lead.id, reference: "FA-SENT-1", status: InvoiceStatus.SENT, totalAmount: 50000 },
    });
    await prisma.invoice.create({
      data: { organizationId: organization.id, leadId: lead.id, reference: "FA-OVERDUE-1", status: InvoiceStatus.OVERDUE, totalAmount: 20000 },
    });
    await prisma.quote.create({
      data: { organizationId: organization.id, leadId: lead.id, reference: "DEV-SENT-1", status: QuoteStatus.SENT, totalAmount: 30000 },
    });
    await prisma.quote.create({
      data: { organizationId: organization.id, leadId: lead.id, reference: "DEV-ACCEPTED-1", status: QuoteStatus.ACCEPTED, totalAmount: 40000 },
    });

    const dashboard = await getFinancialDashboard(organization.id);
    expect(dashboard.totalRevenue).toBe(100000);
    expect(dashboard.pendingInvoices).toEqual({ count: 1, totalAmount: 50000 });
    expect(dashboard.overdueInvoices).toEqual({ count: 1, totalAmount: 20000 });
    expect(dashboard.quotesInProgress).toEqual({ count: 1, totalAmount: 30000 });
    // Prévisionnel = CA encaissé + devis ACCEPTED pas encore facturés (le devis SENT ne compte pas).
    expect(dashboard.forecastedRevenue).toBe(100000 + 40000);
    expect(dashboard.revenueByMonth.reduce((sum, m) => sum + m.amount, 0)).toBe(100000);
  });

  it("isolation multi-tenant : chaque dashboard ne mélange jamais les données de deux organisations", async () => {
    const orgA = await createOrg("isolation-a");
    const orgB = await createOrg("isolation-b");
    const leadA = await prisma.lead.create({ data: { organizationId: orgA.id, establishmentName: "A" } });
    const customerA = await prisma.customer.create({ data: { organizationId: orgA.id, leadId: leadA.id, lifetimeValue: 99999 } });
    await prisma.mission.create({ data: { organizationId: orgA.id, customerId: customerA.id, title: "Mission A" } });

    const dashboardB = await getClientsDashboard(orgB.id);
    expect(dashboardB.totalCustomers).toBe(0);
    const productionB = await getProductionDashboard(orgB.id);
    expect(productionB.byStatus).toHaveLength(0);
  });
});
