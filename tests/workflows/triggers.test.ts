import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInWorkflowComponents } from "@/lib/workflows/bootstrap";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { activateVersion } from "@/lib/workflows/workflow-service";
import { triggerWorkflowsForEvent, processDueWorkflowCronTriggers } from "@/lib/workflows/trigger-engine";
import { matchesCron } from "@/lib/workflows/triggers/cron";
import type { WorkflowGraph } from "@/lib/workflows/graph-types";
import { createWorkflowTestFixture, createActiveWorkflow, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";
import { createAgentTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function simpleEventGraph(eventKey: string): WorkflowGraph {
  return {
    nodes: [
      { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: eventKey } },
      { id: "n1", type: "action", position: { x: 0, y: 1 }, data: { actionKey: "notification.create", input: { type: "workflow", title: "déclenché" } } },
      { id: "end1", type: "end", position: { x: 0, y: 2 }, data: {} },
    ],
    edges: [
      { id: "e1", source: "t1", target: "n1" },
      { id: "e2", source: "n1", target: "end1" },
    ],
  };
}

runIfDatabase("Workflow Engine — déclencheurs", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const agentOrganizationIds: string[] = [];
  const agentUserIds: string[] = [];
  const agentDefinitionIds: string[] = [];

  beforeAll(() => {
    registerBuiltInWorkflowComponents();
    registerBuiltInAgentComponents();
  });

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
    await cleanupAgentTestFixtures(agentOrganizationIds, agentUserIds, agentDefinitionIds);
  });

  async function setup(suffix: string) {
    const fixture = await createWorkflowTestFixture(suffix);
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    return fixture;
  }

  it("un évènement applicatif déclenche tous les workflows actifs abonnés à cette clé", async () => {
    const { organization, workspace, actor } = await setup("event");
    const { definition, version } = await createActiveWorkflow({
      organizationId: organization.id,
      workspaceId: workspace.id,
      key: "event-wf",
      graph: simpleEventGraph("prospect.created"),
    });
    await activateVersion(actor, definition.id, version.id);

    const result = await triggerWorkflowsForEvent("prospect.created", { companyName: "Test" });
    expect(result.triggered).toBe(1);

    const run = await prisma.workflowRun.findFirstOrThrow({ where: { workflowDefinitionId: definition.id } });
    expect(run.trigger).toBe("EVENT");
    expect(run.status).toBe("SUCCEEDED");
  });

  it("un workflow désactivé n'est plus déclenché par le même évènement", async () => {
    const { organization, workspace, actor } = await setup("event-inactive");
    const { definition, version } = await createActiveWorkflow({
      organizationId: organization.id,
      workspaceId: workspace.id,
      key: "event-inactive-wf",
      graph: simpleEventGraph("quote.signed"),
    });
    await activateVersion(actor, definition.id, version.id);

    const { deactivateDefinition } = await import("@/lib/workflows/workflow-service");
    await deactivateDefinition(actor, definition.id);

    const result = await triggerWorkflowsForEvent("quote.signed", {});
    expect(result.triggered).toBe(0);
  });

  it("processDueWorkflowCronTriggers ne déclenche que les workflows dont l'expression cron correspond à l'instant donné", async () => {
    const { organization, workspace, actor } = await setup("cron");
    const now = new Date();
    now.setUTCSeconds(0, 0);
    const currentCron = `${now.getUTCMinutes()} ${now.getUTCHours()} * * *`;
    expect(matchesCron(currentCron, now)).toBe(true);

    const { definition, version } = await createActiveWorkflow({
      organizationId: organization.id,
      workspaceId: workspace.id,
      key: "cron-wf",
      graph: simpleEventGraph("schedule.cron"),
    });
    (version.graph as unknown as WorkflowGraph).nodes[0].data = { triggerKey: "schedule.cron", config: { cronExpression: currentCron } };
    await prisma.workflowVersion.update({ where: { id: version.id }, data: { graph: version.graph as never } });
    await activateVersion(actor, definition.id, version.id);
    // La liaison a été indexée avec l'ancien graphe (sans cronExpression) — on la met à jour explicitement pour ce test.
    await prisma.workflowTriggerBinding.updateMany({
      where: { workflowDefinitionId: definition.id },
      data: { config: { cronExpression: currentCron } as never },
    });

    const result = await processDueWorkflowCronTriggers(now);
    expect(result.triggered).toBe(1);
  });

  it("la fin d'une exécution d'agent déclenche les workflows abonnés à \"agent.run.completed\" (bus d'évènements)", async () => {
    const workflowFixture = await setup("agent-event");
    const { definition, version } = await createActiveWorkflow({
      organizationId: workflowFixture.organization.id,
      workspaceId: workflowFixture.workspace.id,
      key: "agent-event-wf",
      graph: simpleEventGraph("agent.run.completed"),
    });
    await activateVersion(workflowFixture.actor, definition.id, version.id);

    const agentFixture = await createAgentTestFixture("agent-event-source");
    agentOrganizationIds.push(agentFixture.organization.id);
    agentUserIds.push(agentFixture.user.id);
    agentDefinitionIds.push(agentFixture.definition.id);

    const installation = await installAgent(agentFixture.actor, {
      definitionId: agentFixture.definition.id,
      toolKeys: ["system.echo", "system.datetime", "system.workspace_info"],
      permissions: ["VIEW_WORKSPACE"],
    });
    await transitionInstallation(agentFixture.actor, installation.id, "activate");

    const run = await createAgentRun({ installationId: installation.id, input: {} });
    await executeAgentRun(run.id);

    // Le bus d'évènements est asynchrone (await publishDomainEvent dans execution-engine.ts) mais résolu avant le retour d'executeAgentRun.
    const triggeredRun = await prisma.workflowRun.findFirst({ where: { workflowDefinitionId: definition.id } });
    expect(triggeredRun).not.toBeNull();
    expect(triggeredRun?.trigger).toBe("EVENT");
    expect(triggeredRun?.triggerKey).toBe("agent.run.completed");
  });
});
