import { afterAll, describe, expect, it } from "vitest";
import { createAutomationDefinition, resolveAutomationForActor, listAutomationsForWorkspace } from "@/lib/automation/registry/automation-service";
import { NotFoundError } from "@/lib/errors";
import type { AutomationGraph } from "@/lib/automation/graph-types";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";
import { expectNoCrossTenantLeak } from "../helpers/tenant-isolation";

/**
 * Isolation multi-tenant — Automation Engine (v0.10, AR-0055). Même
 * gabarit que `tests/tenant-isolation/workflows.test.ts` (v0.6) appliqué à
 * l'Automation Engine (v0.8), qui dispose d'un analogue exact de
 * `resolveDefinitionForActor` : `resolveAutomationForActor`
 * (src/lib/automation/registry/automation-service.ts), scopé
 * organisation ET workspace.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

const graph: AutomationGraph = {
  nodes: [
    { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "user.action" } },
    { id: "end1", type: "end", position: { x: 0, y: 1 }, data: {} },
  ],
  edges: [{ id: "e1", source: "t1", target: "end1" }],
};

runIfDatabase("isolation multi-tenant — Automation Engine", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  async function setup(suffix: string) {
    const fixture = await createWorkflowTestFixture(suffix);
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const { automation } = await createAutomationDefinition(fixture.actor, {
      key: `automation-${suffix}`,
      name: `Automatisation ${suffix}`,
      category: "test",
      graph,
    });

    return { ...fixture, automationId: automation.id };
  }

  it("listAutomationsForWorkspace ne renvoie jamais l'automatisation d'une autre organisation", async () => {
    const fixtureA = await setup("automation-isolation-a");
    const fixtureB = await setup("automation-isolation-b");

    await expectNoCrossTenantLeak({
      actorAItems: () => listAutomationsForWorkspace(fixtureA.workspace.id),
      actorBItems: () => listAutomationsForWorkspace(fixtureB.workspace.id),
      actorAOwnResourceId: fixtureA.automationId,
      actorBOwnResourceId: fixtureB.automationId,
      getId: (automation) => automation.id,
    });
  });

  it("falsifier l'id d'une automatisation d'une autre organisation échoue (NotFoundError, pas de fuite d'existence)", async () => {
    const fixtureA = await setup("automation-isolation-spoof-a");
    const fixtureB = await setup("automation-isolation-spoof-b");

    await expect(resolveAutomationForActor(fixtureA.actor, fixtureB.automationId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(resolveAutomationForActor(fixtureB.actor, fixtureA.automationId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
