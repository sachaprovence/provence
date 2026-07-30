import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInWorkflowComponents } from "@/lib/workflows/bootstrap";
import { createWorkflowRun, executeWorkflowRun, processDueWorkflowWaits } from "@/lib/workflows/execution-engine";
import { registerWorkflowAction } from "@/lib/workflows/actions/registry";
import type { WorkflowGraph } from "@/lib/workflows/graph-types";
import { createWorkflowTestFixture, createActiveWorkflow, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Workflow Engine — moteur d'exécution", () => {
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

  it("exécute un graphe séquentiel simple jusqu'au succès", async () => {
    const { organization, workspace } = await setup("seq");
    const graph: WorkflowGraph = {
      nodes: [
        { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "user.action" } },
        { id: "n1", type: "action", position: { x: 0, y: 1 }, data: { actionKey: "notification.create", input: { type: "workflow", title: "Bonjour {{ context.name }}" } } },
        { id: "end1", type: "end", position: { x: 0, y: 2 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "t1", target: "n1" },
        { id: "e2", source: "n1", target: "end1" },
      ],
    };
    const { definition, version } = await createActiveWorkflow({ organizationId: organization.id, workspaceId: workspace.id, key: "seq", graph });

    const run = await createWorkflowRun({
      organizationId: organization.id,
      workspaceId: workspace.id,
      workflowDefinitionId: definition.id,
      workflowVersionId: version.id,
      input: { name: "Sacha" },
    });
    await executeWorkflowRun(run.id);

    const finished = await prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id }, include: { steps: true } });
    expect(finished.status).toBe("SUCCEEDED");
    expect(finished.steps.every((s) => s.status === "SUCCEEDED")).toBe(true);

    const notification = await prisma.notification.findFirst({ where: { organizationId: organization.id } });
    expect(notification?.title).toBe("Bonjour Sacha");
  });

  it("branche selon une condition et saute la branche non retenue (cascade)", async () => {
    const { organization, workspace } = await setup("cond");
    const graph: WorkflowGraph = {
      nodes: [
        { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "user.action" } },
        {
          id: "cond1",
          type: "condition",
          position: { x: 0, y: 1 },
          data: { rule: { op: "gte", left: { kind: "var", path: "context.score" }, right: { kind: "literal", value: 50 } } },
        },
        { id: "high", type: "action", position: { x: -1, y: 2 }, data: { actionKey: "notification.create", input: { type: "workflow", title: "haut" } } },
        { id: "low", type: "action", position: { x: 1, y: 2 }, data: { actionKey: "notification.create", input: { type: "workflow", title: "bas" } } },
        { id: "end1", type: "end", position: { x: 0, y: 3 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "t1", target: "cond1" },
        { id: "e2", source: "cond1", target: "high", branch: "true" },
        { id: "e3", source: "cond1", target: "low", branch: "false" },
        { id: "e4", source: "high", target: "end1" },
        { id: "e5", source: "low", target: "end1" },
      ],
    };
    const { definition, version } = await createActiveWorkflow({ organizationId: organization.id, workspaceId: workspace.id, key: "cond", graph });

    const run = await createWorkflowRun({
      organizationId: organization.id,
      workspaceId: workspace.id,
      workflowDefinitionId: definition.id,
      workflowVersionId: version.id,
      input: { score: 10 },
    });
    await executeWorkflowRun(run.id);

    const steps = await prisma.workflowRunStep.findMany({ where: { runId: run.id } });
    const byId = Object.fromEntries(steps.map((s) => [s.nodeId, s.status]));
    expect(byId.low).toBe("SUCCEEDED");
    expect(byId.high).toBe("SKIPPED");
    expect(byId.end1).toBe("SUCCEEDED");
  });

  it("exécute deux branches parallèles indépendantes", async () => {
    const { organization, workspace } = await setup("par");
    const graph: WorkflowGraph = {
      nodes: [
        { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "user.action" } },
        { id: "a1", type: "action", position: { x: -1, y: 1 }, data: { actionKey: "notification.create", input: { type: "workflow", title: "branche A" } } },
        { id: "a2", type: "action", position: { x: 1, y: 1 }, data: { actionKey: "notification.create", input: { type: "workflow", title: "branche B" } } },
        { id: "end1", type: "end", position: { x: 0, y: 2 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "t1", target: "a1" },
        { id: "e2", source: "t1", target: "a2" },
        { id: "e3", source: "a1", target: "end1" },
        { id: "e4", source: "a2", target: "end1" },
      ],
    };
    const { definition, version } = await createActiveWorkflow({ organizationId: organization.id, workspaceId: workspace.id, key: "par", graph });

    const run = await createWorkflowRun({
      organizationId: organization.id,
      workspaceId: workspace.id,
      workflowDefinitionId: definition.id,
      workflowVersionId: version.id,
    });
    await executeWorkflowRun(run.id);

    const finished = await prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(finished.status).toBe("SUCCEEDED");
    const notifications = await prisma.notification.findMany({ where: { organizationId: organization.id } });
    expect(notifications.map((n) => n.title).sort()).toEqual(["branche A", "branche B"]);
  });

  it("suspend sur un noeud d'attente puis reprend via processDueWorkflowWaits", async () => {
    const { organization, workspace } = await setup("wait");
    const graph: WorkflowGraph = {
      nodes: [
        { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "user.action" } },
        { id: "w1", type: "wait", position: { x: 0, y: 1 }, data: { delayMs: 10 } },
        { id: "a1", type: "action", position: { x: 0, y: 2 }, data: { actionKey: "notification.create", input: { type: "workflow", title: "après attente" } } },
        { id: "end1", type: "end", position: { x: 0, y: 3 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "t1", target: "w1" },
        { id: "e2", source: "w1", target: "a1" },
        { id: "e3", source: "a1", target: "end1" },
      ],
    };
    const { definition, version } = await createActiveWorkflow({ organizationId: organization.id, workspaceId: workspace.id, key: "wait", graph });

    const run = await createWorkflowRun({
      organizationId: organization.id,
      workspaceId: workspace.id,
      workflowDefinitionId: definition.id,
      workflowVersionId: version.id,
    });
    await executeWorkflowRun(run.id);

    let current = await prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(current.status).toBe("WAITING");
    expect(current.resumeAt).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 20));
    await processDueWorkflowWaits(new Date());

    current = await prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(current.status).toBe("SUCCEEDED");
  });

  it("réessaie une action en échec selon la politique retry puis réussit", async () => {
    const { organization, workspace } = await setup("retry");
    let callCount = 0;
    registerWorkflowAction({
      key: "test.flaky",
      name: "Flaky (test)",
      description: "Échoue une fois puis réussit.",
      category: "test",
      async execute() {
        callCount += 1;
        if (callCount === 1) throw new Error("échec simulé");
        return { ok: true };
      },
    });

    const graph: WorkflowGraph = {
      nodes: [
        { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "user.action" } },
        { id: "flaky", type: "action", position: { x: 0, y: 1 }, data: { actionKey: "test.flaky", onError: { kind: "retry", maxAttempts: 2, backoffMs: 5 } } },
        { id: "end1", type: "end", position: { x: 0, y: 2 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "t1", target: "flaky" },
        { id: "e2", source: "flaky", target: "end1" },
      ],
    };
    const { definition, version } = await createActiveWorkflow({ organizationId: organization.id, workspaceId: workspace.id, key: "retry", graph });

    const run = await createWorkflowRun({
      organizationId: organization.id,
      workspaceId: workspace.id,
      workflowDefinitionId: definition.id,
      workflowVersionId: version.id,
    });
    await executeWorkflowRun(run.id);

    let current = await prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(current.status).toBe("QUEUED");

    await new Promise((resolve) => setTimeout(resolve, 10));
    await executeWorkflowRun(run.id);

    current = await prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(current.status).toBe("SUCCEEDED");
    expect(callCount).toBe(2);
  });

  it("arrête le run par défaut (policy stop) sur une action en échec", async () => {
    const { organization, workspace } = await setup("stop");
    registerWorkflowAction({
      key: "test.always-fails",
      name: "Always fails (test)",
      description: "Échoue systématiquement.",
      category: "test",
      async execute() {
        throw new Error("échec permanent simulé");
      },
    });

    const graph: WorkflowGraph = {
      nodes: [
        { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "user.action" } },
        { id: "boom", type: "action", position: { x: 0, y: 1 }, data: { actionKey: "test.always-fails" } },
        { id: "end1", type: "end", position: { x: 0, y: 2 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "t1", target: "boom" },
        { id: "e2", source: "boom", target: "end1" },
      ],
    };
    const { definition, version } = await createActiveWorkflow({ organizationId: organization.id, workspaceId: workspace.id, key: "stop", graph });

    const run = await createWorkflowRun({
      organizationId: organization.id,
      workspaceId: workspace.id,
      workflowDefinitionId: definition.id,
      workflowVersionId: version.id,
    });
    await executeWorkflowRun(run.id);

    const finished = await prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id }, include: { steps: true } });
    expect(finished.status).toBe("FAILED");
    const boomStep = finished.steps.find((s) => s.nodeId === "boom");
    const endStep = finished.steps.find((s) => s.nodeId === "end1");
    expect(boomStep?.status).toBe("FAILED");
    expect(endStep?.status).toBe("PENDING");
  });

  it("exécute une boucle sur une collection et agrège les résultats par itération", async () => {
    const { organization, workspace } = await setup("loop");
    const graph: WorkflowGraph = {
      nodes: [
        { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "user.action" } },
        {
          id: "loop1",
          type: "loop",
          position: { x: 0, y: 1 },
          data: { collectionExpr: { kind: "var", path: "context.items" }, itemVar: "item", bodyNodeIds: ["body1"] },
        },
        {
          id: "body1",
          type: "action",
          position: { x: 0, y: 1.5 },
          data: { actionKey: "notification.create", input: { type: "workflow", title: "item {{ workflow.item }}" } },
        },
        { id: "end1", type: "end", position: { x: 0, y: 2 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "t1", target: "loop1" },
        { id: "e2", source: "loop1", target: "end1" },
      ],
    };
    const { definition, version } = await createActiveWorkflow({ organizationId: organization.id, workspaceId: workspace.id, key: "loop", graph });

    const run = await createWorkflowRun({
      organizationId: organization.id,
      workspaceId: workspace.id,
      workflowDefinitionId: definition.id,
      workflowVersionId: version.id,
      input: { items: ["a", "b", "c"] },
    });
    await executeWorkflowRun(run.id);

    const finished = await prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(finished.status).toBe("SUCCEEDED");
    const loopStep = await prisma.workflowRunStep.findUniqueOrThrow({ where: { runId_nodeId: { runId: run.id, nodeId: "loop1" } } });
    expect((loopStep.output as { iterationCount: number }).iterationCount).toBe(3);
    const notifications = await prisma.notification.findMany({ where: { organizationId: organization.id }, orderBy: { createdAt: "asc" } });
    expect(notifications.map((n) => n.title)).toEqual(["item a", "item b", "item c"]);
  });

  it("une action qui dépasse son délai est marquée FAILED (timeout)", async () => {
    const { organization, workspace } = await setup("timeout");
    registerWorkflowAction({
      key: "test.slow",
      name: "Slow (test)",
      description: "Ne se termine jamais avant le timeout.",
      category: "test",
      async execute() {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { ok: true };
      },
    });

    const graph: WorkflowGraph = {
      nodes: [
        { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "user.action" } },
        { id: "slow", type: "action", position: { x: 0, y: 1 }, data: { actionKey: "test.slow", timeoutMs: 20 } },
        { id: "end1", type: "end", position: { x: 0, y: 2 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "t1", target: "slow" },
        { id: "e2", source: "slow", target: "end1" },
      ],
    };
    const { definition, version } = await createActiveWorkflow({ organizationId: organization.id, workspaceId: workspace.id, key: "timeout", graph });

    const run = await createWorkflowRun({
      organizationId: organization.id,
      workspaceId: workspace.id,
      workflowDefinitionId: definition.id,
      workflowVersionId: version.id,
    });
    await executeWorkflowRun(run.id);

    const finished = await prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id }, include: { steps: true } });
    expect(finished.status).toBe("FAILED");
    const slowStep = finished.steps.find((s) => s.nodeId === "slow");
    expect(slowStep?.status).toBe("FAILED");
    expect((slowStep?.error as { message?: string } | null)?.message).toBe("WORKFLOW_STEP_TIMEOUT");
  });

  it("emprunte la branche d'erreur (alternative_branch) et saute la branche normale", async () => {
    const { organization, workspace } = await setup("altbranch");
    registerWorkflowAction({
      key: "test.fails-with-alt",
      name: "Fails with alt (test)",
      description: "Échoue toujours.",
      category: "test",
      async execute() {
        throw new Error("échec simulé");
      },
    });

    const graph: WorkflowGraph = {
      nodes: [
        { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "user.action" } },
        { id: "risky", type: "action", position: { x: 0, y: 1 }, data: { actionKey: "test.fails-with-alt", onError: { kind: "alternative_branch" } } },
        { id: "normal", type: "action", position: { x: -1, y: 2 }, data: { actionKey: "notification.create", input: { type: "workflow", title: "chemin normal" } } },
        { id: "fallback", type: "action", position: { x: 1, y: 2 }, data: { actionKey: "notification.create", input: { type: "workflow", title: "chemin erreur" } } },
        { id: "end1", type: "end", position: { x: 0, y: 3 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "t1", target: "risky" },
        { id: "e2", source: "risky", target: "normal" },
        { id: "e3", source: "risky", target: "fallback", branch: "error" },
        { id: "e4", source: "normal", target: "end1" },
        { id: "e5", source: "fallback", target: "end1" },
      ],
    };
    const { definition, version } = await createActiveWorkflow({ organizationId: organization.id, workspaceId: workspace.id, key: "altbranch", graph });

    const run = await createWorkflowRun({
      organizationId: organization.id,
      workspaceId: workspace.id,
      workflowDefinitionId: definition.id,
      workflowVersionId: version.id,
    });
    await executeWorkflowRun(run.id);

    const steps = await prisma.workflowRunStep.findMany({ where: { runId: run.id } });
    const byId = Object.fromEntries(steps.map((s) => [s.nodeId, s.status]));
    expect(byId.risky).toBe("FAILED");
    expect(byId.normal).toBe("SKIPPED");
    expect(byId.fallback).toBe("SUCCEEDED");
    expect(byId.end1).toBe("SUCCEEDED");
  });

  it("exécute une compensation logique pour une étape déjà réussie après un échec ultérieur", async () => {
    const { organization, workspace } = await setup("compensate");
    const compensated: string[] = [];
    registerWorkflowAction({
      key: "test.compensable",
      name: "Compensable (test)",
      description: "Réussit puis peut être compensée.",
      category: "test",
      async execute() {
        return { bookingId: "abc123" };
      },
    });
    registerWorkflowAction({
      key: "test.compensate",
      name: "Compensate (test)",
      description: "Annule logiquement l'étape précédente.",
      category: "test",
      async execute(input) {
        compensated.push((input as { bookingId: string }).bookingId);
        return { cancelled: true };
      },
    });
    registerWorkflowAction({
      key: "test.fails-after",
      name: "Fails after (test)",
      description: "Échoue toujours, pour déclencher un rollback logique.",
      category: "test",
      async execute() {
        throw new Error("échec ultérieur simulé");
      },
    });

    const graph: WorkflowGraph = {
      nodes: [
        { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "user.action" } },
        { id: "book", type: "action", position: { x: 0, y: 1 }, data: { actionKey: "test.compensable", compensateActionKey: "test.compensate" } },
        { id: "boom", type: "action", position: { x: 0, y: 2 }, data: { actionKey: "test.fails-after" } },
        { id: "end1", type: "end", position: { x: 0, y: 3 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "t1", target: "book" },
        { id: "e2", source: "book", target: "boom" },
        { id: "e3", source: "boom", target: "end1" },
      ],
    };
    const { definition, version } = await createActiveWorkflow({ organizationId: organization.id, workspaceId: workspace.id, key: "compensate", graph });

    const run = await createWorkflowRun({
      organizationId: organization.id,
      workspaceId: workspace.id,
      workflowDefinitionId: definition.id,
      workflowVersionId: version.id,
    });
    await executeWorkflowRun(run.id);

    expect(compensated).toEqual(["abc123"]);
    const bookStep = await prisma.workflowRunStep.findUniqueOrThrow({ where: { runId_nodeId: { runId: run.id, nodeId: "book" } } });
    expect(bookStep.status).toBe("COMPENSATED");
  });
});
