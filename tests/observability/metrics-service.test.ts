import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAiCostMetrics, getEmailMetrics, getApiLatencyMetrics, getObservabilityMetrics } from "@/lib/observability/metrics-service";
import { recordApiMetric } from "@/lib/observability/api-metrics";
import { MembershipRole, WorkspaceRole } from "@/generated/prisma/enums";

/**
 * Métriques de base (v0.9 bis, AR-0049) — vérifie que les compteurs
 * reflètent des évènements simulés RÉELS (vraies lignes `AIRequest`/
 * `EmailEvent`/`ApiRequestMetric`, pas des doubles), et l'isolation
 * multi-tenant.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

async function createOrg(suffix: string) {
  const organization = await prisma.organization.create({ data: { name: `Org métriques ${suffix}` } });
  const workspace = await prisma.workspace.create({
    data: { organizationId: organization.id, name: `Workspace ${suffix}`, slug: "principal", isDefault: true },
  });
  const user = await prisma.user.create({
    data: {
      email: `metrics-${suffix}-${crypto.randomUUID()}@example.test`,
      passwordHash: "not-a-real-hash",
      firstName: "Test",
      lastName: "Metrics",
    },
  });
  await prisma.membership.create({ data: { organizationId: organization.id, userId: user.id, role: MembershipRole.OWNER_ADMIN } });
  await prisma.workspaceMembership.create({ data: { workspaceId: workspace.id, userId: user.id, role: WorkspaceRole.OWNER } });
  return { organization, workspace, user };
}

runIfDatabase("Observability — métriques de base", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("agrège le coût IA réel depuis AIRequest", async () => {
    const { organization, user } = await createOrg("ai-cost");
    organizationIds.push(organization.id);
    userIds.push(user.id);

    await prisma.aIRequest.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        kind: "ANALYZE_LEAD",
        provider: "demo",
        model: "demo-model",
        prompt: "p",
        response: "r",
        estimatedCostUsd: 0.05,
        status: "COMPLETED",
      },
    });
    await prisma.aIRequest.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        kind: "ANALYZE_LEAD",
        provider: "demo",
        model: "demo-model",
        prompt: "p",
        response: "r",
        estimatedCostUsd: 0.03,
        status: "FAILED",
      },
    });

    const metrics = await getAiCostMetrics(organization.id);
    expect(metrics.requestCount).toBe(2);
    expect(metrics.totalCostUsd).toBeCloseTo(0.08, 5);
    expect(metrics.byStatus.COMPLETED).toBe(1);
    expect(metrics.byStatus.FAILED).toBe(1);
  });

  it("agrège le taux d'échec email réel depuis EmailEvent (via Message → Lead → Organization)", async () => {
    const { organization } = await createOrg("email-metrics");
    organizationIds.push(organization.id);

    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client email" } });
    const sentMessage = await prisma.message.create({ data: { leadId: lead.id, type: "FIRST_CONTACT_EMAIL", body: "b", status: "SENT" } });
    const failedMessage = await prisma.message.create({ data: { leadId: lead.id, type: "FIRST_CONTACT_EMAIL", body: "b", status: "FAILED" } });
    await prisma.emailEvent.create({ data: { messageId: sentMessage.id, type: "SENT" } });
    await prisma.emailEvent.create({ data: { messageId: failedMessage.id, type: "FAILED" } });

    const metrics = await getEmailMetrics(organization.id);
    expect(metrics.total).toBe(2);
    expect(metrics.sent).toBe(1);
    expect(metrics.failed).toBe(1);
    expect(metrics.failureRate).toBeCloseTo(0.5, 5);
  });

  it("agrège la latence API réelle depuis ApiRequestMetric", async () => {
    const { organization } = await createOrg("api-latency");
    organizationIds.push(organization.id);

    await recordApiMetric({ organizationId: organization.id, route: "GET /api/leads", method: "GET", statusCode: 200, durationMs: 100 });
    await recordApiMetric({ organizationId: organization.id, route: "GET /api/leads", method: "GET", statusCode: 200, durationMs: 200 });
    await recordApiMetric({ organizationId: organization.id, route: "POST /api/quotes", method: "POST", statusCode: 500, durationMs: 50 });

    const metrics = await getApiLatencyMetrics(organization.id);
    expect(metrics.requestCount).toBe(3);
    expect(metrics.avgDurationMs).toBeCloseTo((100 + 200 + 50) / 3, 5);
    expect(metrics.errorCount).toBe(1);
    expect(metrics.byRoute["GET /api/leads"].count).toBe(2);
    expect(metrics.byRoute["GET /api/leads"].avgDurationMs).toBeCloseTo(150, 5);
  });

  it("isolation multi-tenant : les métriques d'une organisation ne fuient jamais vers une autre", async () => {
    const orgA = await createOrg("tenant-a");
    const orgB = await createOrg("tenant-b");
    organizationIds.push(orgA.organization.id, orgB.organization.id);

    await prisma.aIRequest.create({
      data: {
        organizationId: orgA.organization.id,
        kind: "ANALYZE_LEAD",
        provider: "demo",
        model: "demo-model",
        prompt: "p",
        response: "r",
        estimatedCostUsd: 1.0,
        status: "COMPLETED",
      },
    });
    await recordApiMetric({ organizationId: orgA.organization.id, route: "GET /api/leads", method: "GET", statusCode: 200, durationMs: 999 });

    const metricsB = await getObservabilityMetrics(orgB.organization.id);
    expect(metricsB.ai.totalCostUsd).toBe(0);
    expect(metricsB.apiLatency.requestCount).toBe(0);

    const metricsA = await getObservabilityMetrics(orgA.organization.id);
    expect(metricsA.ai.totalCostUsd).toBe(1.0);
    expect(metricsA.apiLatency.requestCount).toBe(1);
  });
});
