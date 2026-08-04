import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { createAutomationDefinition, activateAutomationVersion } from "@/lib/automation/registry/automation-service";
import { fireAutomationsForEvent, fireAutomationWebhook, processDueAutomationSchedules } from "@/lib/automation/trigger-engine";
import type { AutomationGraph } from "@/lib/automation/graph-types";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function graphWithTrigger(triggerKey: string, config?: Record<string, unknown>): AutomationGraph {
  return {
    nodes: [
      { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey, config } },
      { id: "end1", type: "end", position: { x: 0, y: 100 }, data: {} },
    ],
    edges: [{ id: "e1", source: "t1", target: "end1" }],
  };
}

runIfDatabase("Automation Engine — Trigger Engine (évènements/cron/webhook)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("fireAutomationsForEvent déclenche toutes les automatisations actives abonnées à la clé d'évènement", async () => {
    const fixture = await createWorkflowTestFixture("trigger-engine-event");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const { automation, version } = await createAutomationDefinition(fixture.actor, {
      key: "on-lead-created",
      name: "Sur création de lead",
      category: "test",
      graph: graphWithTrigger("lead.created"),
    });
    await activateAutomationVersion(fixture.actor, automation.id, version.id);

    const result = await fireAutomationsForEvent("lead.created", { organizationId: fixture.organization.id, leadId: "lead-123" });
    expect(result.triggered).toBe(1);

    const run = await prisma.automationRun.findFirstOrThrow({ where: { automationId: automation.id } });
    expect(run.trigger).toBe("EVENT");
    expect(run.triggerKey).toBe("lead.created");
    expect((run.input as { leadId: string }).leadId).toBe("lead-123");
  });

  it("fireAutomationsForEvent propage previousStage/newStage pour lead.stage_changed (v1.1, AR-0165)", async () => {
    const fixture = await createWorkflowTestFixture("trigger-engine-stage-changed");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const { automation, version } = await createAutomationDefinition(fixture.actor, {
      key: "on-lead-stage-changed",
      name: "Sur transition de pipeline",
      category: "test",
      graph: graphWithTrigger("lead.stage_changed"),
    });
    await activateAutomationVersion(fixture.actor, automation.id, version.id);

    const result = await fireAutomationsForEvent("lead.stage_changed", {
      organizationId: fixture.organization.id,
      leadId: "lead-abc",
      previousStage: "NEW",
      newStage: "WON",
    });
    expect(result.triggered).toBe(1);

    const run = await prisma.automationRun.findFirstOrThrow({ where: { automationId: automation.id } });
    expect(run.triggerKey).toBe("lead.stage_changed");
    const input = run.input as { previousStage: string; newStage: string };
    expect(input.previousStage).toBe("NEW");
    expect(input.newStage).toBe("WON");
  });

  it("fireAutomationsForEvent isole strictement par organisation : un évènement d'une autre organisation ne déclenche rien", async () => {
    const fixtureA = await createWorkflowTestFixture("trigger-engine-tenant-a");
    organizationIds.push(fixtureA.organization.id);
    userIds.push(fixtureA.user.id);
    const fixtureB = await createWorkflowTestFixture("trigger-engine-tenant-b");
    organizationIds.push(fixtureB.organization.id);
    userIds.push(fixtureB.user.id);

    const { automation, version } = await createAutomationDefinition(fixtureA.actor, {
      key: "on-lead-created-isolated",
      name: "Isolé",
      category: "test",
      graph: graphWithTrigger("lead.created"),
    });
    await activateAutomationVersion(fixtureA.actor, automation.id, version.id);

    const result = await fireAutomationsForEvent("lead.created", { organizationId: fixtureB.organization.id, leadId: "lead-999" });
    expect(result.triggered).toBe(0);

    const runs = await prisma.automationRun.findMany({ where: { automationId: automation.id } });
    expect(runs.length).toBe(0);
  });

  it("processDueAutomationSchedules déclenche un binding schedule.cron dont l'expression correspond, jamais un autre", async () => {
    const fixture = await createWorkflowTestFixture("trigger-engine-cron");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const { automation: matching, version: matchingVersion } = await createAutomationDefinition(fixture.actor, {
      key: "cron-matching",
      name: "Cron correspondant",
      category: "test",
      graph: graphWithTrigger("schedule.cron", { cronExpression: "* * * * *" }),
    });
    await activateAutomationVersion(fixture.actor, matching.id, matchingVersion.id);

    const { automation: nonMatching, version: nonMatchingVersion } = await createAutomationDefinition(fixture.actor, {
      key: "cron-non-matching",
      name: "Cron non correspondant",
      category: "test",
      graph: graphWithTrigger("schedule.cron", { cronExpression: "0 0 1 1 *" }),
    });
    await activateAutomationVersion(fixture.actor, nonMatching.id, nonMatchingVersion.id);

    const now = new Date("2026-06-15T10:30:00.000Z");
    const result = await processDueAutomationSchedules(now);
    expect(result.triggered).toBeGreaterThanOrEqual(1);

    const matchingRuns = await prisma.automationRun.findMany({ where: { automationId: matching.id } });
    expect(matchingRuns.length).toBe(1);
    expect(matchingRuns[0].trigger).toBe("SCHEDULED");

    const nonMatchingRuns = await prisma.automationRun.findMany({ where: { automationId: nonMatching.id } });
    expect(nonMatchingRuns.length).toBe(0);
  });

  it("fireAutomationWebhook cible une seule automatisation (par workspace + clé) et échoue si elle n'existe pas", async () => {
    const fixture = await createWorkflowTestFixture("trigger-engine-webhook");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const { automation, version } = await createAutomationDefinition(fixture.actor, {
      key: "webhook-target",
      name: "Cible webhook",
      category: "test",
      graph: graphWithTrigger("webhook.received"),
    });
    await activateAutomationVersion(fixture.actor, automation.id, version.id);

    const run = await fireAutomationWebhook(fixture.workspace.id, "webhook-target", { hello: "world" });
    expect(run.trigger).toBe("WEBHOOK");
    expect(run.automationId).toBe(automation.id);

    await expect(fireAutomationWebhook(fixture.workspace.id, "does-not-exist", {})).rejects.toThrow(NotFoundError);
  });
});
