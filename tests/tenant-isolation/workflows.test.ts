import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInWorkflowComponents } from "@/lib/workflows/bootstrap";
import { resolveDefinitionForActor, resolveRunForActor, createWorkflowDefinition, triggerManualRun, activateVersion } from "@/lib/workflows/workflow-service";
import { NotFoundError } from "@/lib/errors";
import type { WorkflowGraph } from "@/lib/workflows/graph-types";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";
import { expectNoCrossTenantLeak } from "../helpers/tenant-isolation";

/**
 * Isolation multi-tenant du Workflow Engine (v0.6) : deux organisations
 * distinctes ne doivent jamais voir les workflows/runs l'une de l'autre —
 * même gabarit que `tests/tenant-isolation/commercial.test.ts` (v0.5).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

const graph: WorkflowGraph = {
  nodes: [
    { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "user.action" } },
    { id: "end1", type: "end", position: { x: 0, y: 1 }, data: {} },
  ],
  edges: [{ id: "e1", source: "t1", target: "end1" }],
};

runIfDatabase("isolation multi-tenant — Workflow Engine", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(() => {
    registerBuiltInWorkflowComponents();
  });

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  async function setupWithRun(suffix: string) {
    const fixture = await createWorkflowTestFixture(suffix);
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const { definition, version } = await createWorkflowDefinition(fixture.actor, {
      key: `wf-${suffix}`,
      name: `Workflow ${suffix}`,
      category: "test",
      graph,
    });
    await activateVersion(fixture.actor, definition.id, version.id);
    const run = await triggerManualRun(fixture.actor, definition.id, {});

    return { ...fixture, definitionId: definition.id, runId: run.id };
  }

  it("les workflows et exécutions d'une organisation sont invisibles à une autre", async () => {
    const fixtureA = await setupWithRun("wf-isolation-a");
    const fixtureB = await setupWithRun("wf-isolation-b");

    await expectNoCrossTenantLeak({
      actorAItems: () => prisma.workflowDefinition.findMany({ where: { workspaceId: fixtureA.workspace.id } }),
      actorBItems: () => prisma.workflowDefinition.findMany({ where: { workspaceId: fixtureB.workspace.id } }),
      actorAOwnResourceId: fixtureA.definitionId,
      actorBOwnResourceId: fixtureB.definitionId,
      getId: (d) => d.id,
    });

    await expectNoCrossTenantLeak({
      actorAItems: () => prisma.workflowRun.findMany({ where: { workspaceId: fixtureA.workspace.id } }),
      actorBItems: () => prisma.workflowRun.findMany({ where: { workspaceId: fixtureB.workspace.id } }),
      actorAOwnResourceId: fixtureA.runId,
      actorBOwnResourceId: fixtureB.runId,
      getId: (r) => r.id,
    });
  });

  it("falsifier l'id d'un workflow ou d'un run d'une autre organisation échoue (NotFoundError, pas de fuite d'existence)", async () => {
    const fixtureA = await setupWithRun("wf-isolation-spoof-a");
    const fixtureB = await setupWithRun("wf-isolation-spoof-b");

    await expect(resolveDefinitionForActor(fixtureA.actor, fixtureB.definitionId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(resolveRunForActor(fixtureA.actor, fixtureB.runId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
