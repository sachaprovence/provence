import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getProductionDashboard,
  getClientsDashboard,
  getVisitsDashboard,
  getAppointmentsDashboard,
  getAiActivityDashboard,
  getPerformanceDashboard,
} from "@/lib/dashboards/dashboard-service";
import { MissionStatus, AppointmentStatus, VirtualTourStatus, AIRequestKind, AIRequestStatus, MembershipRole } from "@/generated/prisma/enums";

/**
 * Dashboards v0.9 (ADR 0038) : Production/Clients/Visites/Rendez-vous/
 * Activité IA/Performance — les six dashboards du brief non déjà couverts
 * par `/dashboard` (Commercial/CA) et `/automations` (Automatisations).
 * Vérifie les agrégations clés et l'isolation multi-tenant.
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
