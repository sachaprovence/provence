import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAiCostMetrics, getEmailMetrics, getApiLatencyMetrics, getObservabilityMetrics, getQueueWorkerMetrics } from "@/lib/observability/metrics-service";
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

  it("calcule errorRate (v1.3, AR-0174) — null sans aucune requête, sinon errorCount/requestCount", async () => {
    const { organization } = await createOrg("api-error-rate");
    organizationIds.push(organization.id);

    const emptyMetrics = await getApiLatencyMetrics(organization.id);
    expect(emptyMetrics.errorRate).toBeNull();

    await recordApiMetric({ organizationId: organization.id, route: "GET /api/leads", method: "GET", statusCode: 200, durationMs: 10 });
    await recordApiMetric({ organizationId: organization.id, route: "GET /api/leads", method: "GET", statusCode: 500, durationMs: 10 });
    await recordApiMetric({ organizationId: organization.id, route: "GET /api/leads", method: "GET", statusCode: 503, durationMs: 10 });
    await recordApiMetric({ organizationId: organization.id, route: "GET /api/leads", method: "GET", statusCode: 200, durationMs: 10 });

    const metrics = await getApiLatencyMetrics(organization.id);
    expect(metrics.errorRate).toBeCloseTo(0.5, 5);
  });

  it("getQueueWorkerMetrics (v1.3, AR-0174) agrège AutomationJob par organisation", async () => {
    const { organization, workspace } = await createOrg("queue-worker");
    organizationIds.push(organization.id);

    await prisma.automationJob.create({
      data: { organizationId: organization.id, workspaceId: workspace.id, jobType: "notification.create", status: "QUEUED" },
    });
    await prisma.automationJob.create({
      data: { organizationId: organization.id, workspaceId: workspace.id, jobType: "notification.create", status: "SUCCEEDED" },
    });
    await prisma.automationJob.create({
      data: { organizationId: organization.id, workspaceId: workspace.id, jobType: "notification.create", status: "FAILED" },
    });

    const metrics = await getQueueWorkerMetrics(organization.id);
    expect(metrics.queue.counts.queued).toBe(1);
    expect(metrics.queue.counts.succeeded).toBe(1);
    expect(metrics.queue.counts.failed).toBe(1);
    expect(metrics.queue.counts.total).toBe(3);
    expect(metrics.queue.failureRate).toBeCloseTo(1 / 3, 5);
    expect(metrics.queue.dueNow).toBe(1);
    expect(metrics.workers.poolSize).toBeGreaterThan(0);
    expect(metrics.workers.active).toBe(0); // aucun job réclamé (claimedBy) dans ce test
  });

  it("getQueueWorkerMetrics : isolation multi-tenant — les jobs d'une autre organisation ne fuient jamais", async () => {
    const orgA = await createOrg("queue-tenant-a");
    const orgB = await createOrg("queue-tenant-b");
    organizationIds.push(orgA.organization.id, orgB.organization.id);

    await prisma.automationJob.create({
      data: { organizationId: orgA.organization.id, workspaceId: orgA.workspace.id, jobType: "notification.create", status: "QUEUED" },
    });

    const metricsB = await getQueueWorkerMetrics(orgB.organization.id);
    expect(metricsB.queue.counts.total).toBe(0);
    expect(metricsB.queue.dueNow).toBe(0);
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
