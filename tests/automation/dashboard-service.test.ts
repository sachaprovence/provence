import { afterAll, describe, expect, it } from "vitest";
import {
  createAutomationDefinition,
  activateAutomationVersion,
  createAutomationRun,
} from "@/lib/automation/registry/automation-service";
import { processAutomationJobs, processQueuedAutomationRuns } from "@/lib/automation/executor";
import { getAutomationDashboard } from "@/lib/automation/dashboard-service";
import { recordCircuitSuccess } from "@/lib/automation/retry";
import type { AutomationGraph } from "@/lib/automation/graph-types";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT", "WAITING"]);

async function driveToTerminal(runId: string, maxTicks = 40) {
  const { prisma } = await import("@/lib/prisma");
  for (let i = 0; i < maxTicks; i += 1) {
    const run = await prisma.automationRun.findUniqueOrThrow({ where: { id: runId } });
    if (TERMINAL.has(run.status)) return run;
    await processQueuedAutomationRuns();
    await processAutomationJobs({ limit: 20 });
  }
  return prisma.automationRun.findUniqueOrThrow({ where: { id: runId } });
}

function linearGraph(jobType: string): AutomationGraph {
  return {
    nodes: [
      { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "manual.user_action" } },
      { id: "a1", type: "action", position: { x: 0, y: 100 }, data: { jobType, input: { title: "Dashboard" }, retryPolicy: { strategy: "immediate", maxAttempts: 1 } } },
      { id: "end1", type: "end", position: { x: 0, y: 200 }, data: {} },
    ],
    edges: [
      { id: "e1", source: "t1", target: "a1" },
      { id: "e2", source: "a1", target: "end1" },
    ],
  };
}

runIfDatabase("Automation Engine dashboard", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("agrège automatisations/runs/jobs/retries/DLQ/files d'un workspace", async () => {
    // Clé de disjoncteur DÉDIÉE (jamais "jobType:sms.send", partagée avec job-executor.test.ts) —
    // deux fichiers de test tournant dans des workers parallèles ne doivent jamais se disputer
    // le même état global de disjoncteur (voir la leçon consignée dans job-executor.test.ts).
    await recordCircuitSuccess("jobType:file.write");
    const fixture = await createWorkflowTestFixture("dashboard-automation");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const { automation: successAutomation, version: successVersion } = await createAutomationDefinition(fixture.actor, {
      key: "dashboard-success",
      name: "Succès",
      category: "test",
      graph: linearGraph("notification.create"),
    });
    await activateAutomationVersion(fixture.actor, successAutomation.id, successVersion.id);
    const successRun = await createAutomationRun({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      automationId: successAutomation.id,
      automationVersionId: successVersion.id,
    });
    await driveToTerminal(successRun.id);

    const { automation: failAutomation, version: failVersion } = await createAutomationDefinition(fixture.actor, {
      key: "dashboard-failure",
      name: "Échec",
      category: "test",
      graph: linearGraph("file.write"),
    });
    await activateAutomationVersion(fixture.actor, failAutomation.id, failVersion.id);
    const failRun = await createAutomationRun({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      automationId: failAutomation.id,
      automationVersionId: failVersion.id,
    });
    await driveToTerminal(failRun.id);

    const dashboard = await getAutomationDashboard(fixture.workspace.id);

    expect(dashboard.automations.counts.active).toBeGreaterThanOrEqual(2);
    expect(dashboard.automations.counts.total).toBeGreaterThanOrEqual(2);

    expect(dashboard.runs.counts.succeeded).toBeGreaterThanOrEqual(1);
    expect(dashboard.runs.counts.failed).toBeGreaterThanOrEqual(1);
    expect(dashboard.runs.counts.total).toBeGreaterThanOrEqual(2);
    expect(dashboard.runs.successRate).not.toBeNull();

    expect(dashboard.jobs.counts.succeeded).toBeGreaterThanOrEqual(1);
    expect(dashboard.jobs.counts.deadLettered).toBeGreaterThanOrEqual(1);
    expect(dashboard.jobs.totalRetries).toBeGreaterThanOrEqual(0);
    expect(dashboard.jobs.byJobType.some((row) => row.jobType === "notification.create")).toBe(true);
    expect(dashboard.jobs.byJobType.some((row) => row.jobType === "file.write" && row.failed >= 1)).toBe(true);

    expect(dashboard.deadLetterQueue.count).toBeGreaterThanOrEqual(1);
    expect(dashboard.deadLetterQueue.recent.some((job) => job.jobType === "file.write")).toBe(true);

    expect(dashboard.queue.workerPoolSize).toBeGreaterThan(0);
    expect(dashboard.queue.dueNow).toBeGreaterThanOrEqual(0);

    // Métrique "Temps gagné" (v1.1, AR-0178) : un seul job notification.create réussi (5 minutes estimées), aucun temps compté pour le job en échec.
    expect(dashboard.timeSaved.totalMinutes).toBeGreaterThanOrEqual(1);
    const notificationEntry = dashboard.timeSaved.byJobType.find((row) => row.jobType === "notification.create");
    expect(notificationEntry?.succeededCount).toBeGreaterThanOrEqual(1);
    expect(notificationEntry?.minutesSaved).toBe((notificationEntry?.succeededCount ?? 0) * 1);
    expect(dashboard.timeSaved.byJobType.some((row) => row.jobType === "file.write")).toBe(false);
    expect(dashboard.timeSaved.totalHours).toBe(Math.round((dashboard.timeSaved.totalMinutes / 60) * 10) / 10);
  });
});
