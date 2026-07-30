import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInWorkflowComponents } from "@/lib/workflows/bootstrap";
import {
  createWorkflowDefinition,
  createNewVersion,
  activateVersion,
  deactivateDefinition,
  archiveDefinition,
  cloneWorkflowDefinition,
  exportWorkflowDefinition,
  importWorkflowDefinition,
  triggerManualRun,
} from "@/lib/workflows/workflow-service";
import type { WorkflowGraph } from "@/lib/workflows/graph-types";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function simpleGraph(title: string): WorkflowGraph {
  return {
    nodes: [
      { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "user.action" } },
      { id: "n1", type: "action", position: { x: 0, y: 1 }, data: { actionKey: "notification.create", input: { type: "workflow", title } } },
      { id: "end1", type: "end", position: { x: 0, y: 2 }, data: {} },
    ],
    edges: [
      { id: "e1", source: "t1", target: "n1" },
      { id: "e2", source: "n1", target: "end1" },
    ],
  };
}

runIfDatabase("Workflow Engine — service de cycle de vie", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(() => {
    registerBuiltInWorkflowComponents();
  });

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  async function setup(suffix: string) {
    const fixture = await createWorkflowTestFixture(suffix);
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    return fixture;
  }

  it("crée, versionne, active, déclenche, désactive et archive un workflow", async () => {
    const { actor } = await setup("lifecycle");

    const { definition } = await createWorkflowDefinition(actor, {
      key: "lifecycle-wf",
      name: "Workflow de test",
      category: "test",
      graph: simpleGraph("v1"),
    });
    expect(definition.status).toBe("DRAFT");

    const v2 = await createNewVersion(actor, definition.id, { graph: simpleGraph("v2"), changelog: "v2" });
    expect(v2.version).toBe(2);

    const activated = await activateVersion(actor, definition.id, v2.id);
    expect(activated.status).toBe("ACTIVE");
    expect(activated.activeVersionId).toBe(v2.id);

    const binding = await prisma.workflowTriggerBinding.findFirst({ where: { workflowDefinitionId: definition.id } });
    expect(binding?.triggerKey).toBe("user.action");

    const run = await triggerManualRun(actor, definition.id, {});
    expect(["SUCCEEDED", "QUEUED", "RUNNING"]).toContain(run.status);

    const notification = await prisma.notification.findFirst({ where: { organizationId: actor.organization.id } });
    expect(notification?.title).toBe("v2");

    const deactivated = await deactivateDefinition(actor, definition.id);
    expect(deactivated.status).toBe("INACTIVE");

    const archived = await archiveDefinition(actor, definition.id);
    expect(archived.status).toBe("ARCHIVED");
    await expect(createNewVersion(actor, definition.id, { graph: simpleGraph("v3") })).rejects.toThrow();
  });

  it("clone un workflow, l'exporte puis le réimporte sous une nouvelle clé", async () => {
    const { actor } = await setup("clone");

    const { definition, version } = await createWorkflowDefinition(actor, {
      key: "source-wf",
      name: "Source",
      category: "test",
      graph: simpleGraph("source"),
    });
    await activateVersion(actor, definition.id, version.id);

    const { definition: clone } = await cloneWorkflowDefinition(actor, definition.id, { newKey: "cloned-wf", newName: "Clone" });
    expect(clone.status).toBe("DRAFT");
    expect(clone.sourceTemplateKey).toBeNull();

    const exported = await exportWorkflowDefinition(actor, definition.id);
    expect(exported.key).toBe("source-wf");

    const { definition: imported } = await importWorkflowDefinition(actor, exported);
    expect(imported.key).toBe("source-wf-import-1");
    expect(imported.status).toBe("DRAFT");
  });

  it("rejette un graphe invalide (aucun déclencheur)", async () => {
    const { actor } = await setup("invalid");
    const invalidGraph: WorkflowGraph = {
      nodes: [{ id: "end1", type: "end", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    };
    await expect(
      createWorkflowDefinition(actor, { key: "invalid-wf", name: "Invalide", category: "test", graph: invalidGraph })
    ).rejects.toThrow();
  });
});
