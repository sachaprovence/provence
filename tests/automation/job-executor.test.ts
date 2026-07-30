import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createAutomationDefinition,
  activateAutomationVersion,
  createAutomationRun,
} from "@/lib/automation/registry/automation-service";
import {
  advanceAutomationRun,
  processAutomationJobs,
  processQueuedAutomationRuns,
  processDueAutomationRunWaits,
  cancelAutomationRun,
  triggerManualAutomationRun,
  retryAutomationRun,
} from "@/lib/automation/executor";
import { registerBuiltInAutomationActions } from "@/lib/automation/actions";
import { recordCircuitSuccess } from "@/lib/automation/retry";
import type { AutomationGraph, AutomationErrorPolicy } from "@/lib/automation/graph-types";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT", "WAITING"]);

/**
 * N'appelle JAMAIS `advanceAutomationRun` directement sur un run déjà
 * `WAITING` : seul `processDueAutomationRunWaits` (dont le contrat garantit
 * que le délai est écoulé) a le droit de le reprendre — voir le commentaire
 * de `advanceAutomationRun`. `processQueuedAutomationRuns` (pour le premier
 * démarrage) et `processAutomationJobs` (qui rappelle `advanceAutomationRun`
 * lui-même à la fin de chaque job) suffisent à faire progresser un run tant
 * qu'il n'est pas suspendu.
 */
async function driveToTerminal(runId: string, maxTicks = 40) {
  for (let i = 0; i < maxTicks; i += 1) {
    const run = await prisma.automationRun.findUniqueOrThrow({ where: { id: runId } });
    if (TERMINAL.has(run.status)) return run;
    await processQueuedAutomationRuns();
    await processAutomationJobs({ limit: 20 });
  }
  return prisma.automationRun.findUniqueOrThrow({ where: { id: runId } });
}

function linearGraph(jobType: string, input: Record<string, unknown> = { title: "Hello" }, onError?: AutomationErrorPolicy): AutomationGraph {
  return {
    nodes: [
      { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "manual.user_action" } },
      { id: "a1", type: "action", position: { x: 0, y: 100 }, data: { jobType, input, onError, retryPolicy: { strategy: "immediate", maxAttempts: 1 } } },
      { id: "end1", type: "end", position: { x: 0, y: 200 }, data: {} },
    ],
    edges: [
      { id: "e1", source: "t1", target: "a1" },
      { id: "e2", source: "a1", target: "end1" },
    ],
  };
}

runIfDatabase("Automation Engine — Job Executor (orchestrateur)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("exécute un graphe linéaire (trigger -> action -> end) jusqu'au succès", async () => {
    registerBuiltInAutomationActions();
    const fixture = await createWorkflowTestFixture("job-executor-linear");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const { automation, version } = await createAutomationDefinition(fixture.actor, {
      key: "linear",
      name: "Linéaire",
      category: "test",
      graph: linearGraph("notification.create", { title: "Hello" }),
    });
    await activateAutomationVersion(fixture.actor, automation.id, version.id);

    const run = await createAutomationRun({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      automationId: automation.id,
      automationVersionId: version.id,
    });

    const finished = await driveToTerminal(run.id);
    expect(finished.status).toBe("SUCCEEDED");

    const job = await prisma.automationJob.findFirstOrThrow({ where: { automationRunId: run.id, nodeId: "a1" } });
    expect(job.status).toBe("SUCCEEDED");
    const notification = await prisma.notification.findUniqueOrThrow({ where: { id: (job.output as { id: string }).id } });
    expect(notification.title).toBe("Hello");
  });

  it("branche sur un noeud condition, ignore la branche non empruntée", async () => {
    const fixture = await createWorkflowTestFixture("job-executor-condition");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const graph: AutomationGraph = {
      nodes: [
        { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "manual.user_action" } },
        { id: "c1", type: "condition", position: { x: 0, y: 50 }, data: { rule: { op: "eq", left: { kind: "literal", value: 1 }, right: { kind: "literal", value: 1 } } } },
        { id: "aTrue", type: "action", position: { x: -50, y: 100 }, data: { jobType: "notification.create", input: { title: "Branche vraie" } } },
        { id: "aFalse", type: "action", position: { x: 50, y: 100 }, data: { jobType: "notification.create", input: { title: "Branche fausse" } } },
        { id: "end1", type: "end", position: { x: 0, y: 200 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "t1", target: "c1" },
        { id: "e2", source: "c1", target: "aTrue", branch: "true" },
        { id: "e3", source: "c1", target: "aFalse", branch: "false" },
        { id: "e4", source: "aTrue", target: "end1" },
        { id: "e5", source: "aFalse", target: "end1" },
      ],
    };

    const { automation, version } = await createAutomationDefinition(fixture.actor, { key: "branching", name: "Branchement", category: "test", graph });
    await activateAutomationVersion(fixture.actor, automation.id, version.id);
    const run = await createAutomationRun({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      automationId: automation.id,
      automationVersionId: version.id,
    });

    const finished = await driveToTerminal(run.id);
    expect(finished.status).toBe("SUCCEEDED");

    const trueJob = await prisma.automationJob.findFirst({ where: { automationRunId: run.id, nodeId: "aTrue" } });
    const falseJob = await prisma.automationJob.findFirst({ where: { automationRunId: run.id, nodeId: "aFalse" } });
    expect(trueJob?.status).toBe("SUCCEEDED");
    expect(falseJob).toBeNull();
  });

  it('un job épuisant ses tentatives avec onError "ignore" laisse le run réussir (noeud ignoré)', async () => {
    // Le disjoncteur ("jobType:sms.send") est un état GLOBAL persisté, partagé entre les
    // exécutions de la suite de tests — le réinitialiser évite qu'une accumulation
    // d'échecs d'un précédent run ne l'ouvre et ne fasse patienter ce job (voir ADR 0033).
    await recordCircuitSuccess("jobType:sms.send");
    const fixture = await createWorkflowTestFixture("job-executor-ignore");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const { automation, version } = await createAutomationDefinition(fixture.actor, {
      key: "ignore-failure",
      name: "Ignore",
      category: "test",
      graph: linearGraph("sms.send", {}, { kind: "ignore" }),
    });
    await activateAutomationVersion(fixture.actor, automation.id, version.id);
    const run = await createAutomationRun({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      automationId: automation.id,
      automationVersionId: version.id,
    });

    const finished = await driveToTerminal(run.id);
    expect(finished.status).toBe("SUCCEEDED");

    const job = await prisma.automationJob.findFirstOrThrow({ where: { automationRunId: run.id, nodeId: "a1" } });
    expect(job.status).toBe("DEAD_LETTERED");
  });

  it("un job épuisant ses tentatives sans politique déclarée (stop par défaut) fait échouer le run", async () => {
    await recordCircuitSuccess("jobType:sms.send");
    const fixture = await createWorkflowTestFixture("job-executor-stop");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const { automation, version } = await createAutomationDefinition(fixture.actor, {
      key: "stop-failure",
      name: "Stop",
      category: "test",
      graph: linearGraph("sms.send", {}),
    });
    await activateAutomationVersion(fixture.actor, automation.id, version.id);
    const run = await createAutomationRun({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      automationId: automation.id,
      automationVersionId: version.id,
    });

    const finished = await driveToTerminal(run.id);
    expect(finished.status).toBe("FAILED");
  });

  it("un noeud loop itère séquentiellement sur chaque élément de la collection", async () => {
    const fixture = await createWorkflowTestFixture("job-executor-loop");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const graph: AutomationGraph = {
      nodes: [
        { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "manual.user_action" } },
        {
          id: "loop1",
          type: "loop",
          position: { x: 0, y: 100 },
          data: { collectionExpr: { kind: "var", path: "context.items" }, itemVar: "item", bodyNodeIds: ["b1"] },
        },
        { id: "b1", type: "action", position: { x: 0, y: 150 }, data: { jobType: "notification.create", input: { title: "{{ workflow.item }}" } } },
        { id: "end1", type: "end", position: { x: 0, y: 200 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "t1", target: "loop1" },
        { id: "e2", source: "loop1", target: "end1" },
      ],
    };

    const { automation, version } = await createAutomationDefinition(fixture.actor, { key: "loop-test", name: "Boucle", category: "test", graph });
    await activateAutomationVersion(fixture.actor, automation.id, version.id);
    const run = await createAutomationRun({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      automationId: automation.id,
      automationVersionId: version.id,
      input: { items: ["un", "deux", "trois"] },
    });

    const finished = await driveToTerminal(run.id, 60);
    expect(finished.status).toBe("SUCCEEDED");
    const loopOutput = (finished.output as { loop1: { iterationCount: number } }).loop1;
    expect(loopOutput.iterationCount).toBe(3);

    const jobs = await prisma.automationJob.findMany({ where: { automationRunId: run.id, jobType: "notification.create" } });
    expect(jobs.length).toBe(3);
    expect(jobs.every((j) => j.status === "SUCCEEDED")).toBe(true);
  });

  it('un noeud "map" traite les éléments en parallèle (jusqu\'à concurrencyLimit)', async () => {
    const fixture = await createWorkflowTestFixture("job-executor-map");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const graph: AutomationGraph = {
      nodes: [
        { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "manual.user_action" } },
        {
          id: "map1",
          type: "map",
          position: { x: 0, y: 100 },
          data: { collectionExpr: { kind: "var", path: "context.items" }, itemVar: "item", bodyNodeIds: ["b1"], concurrencyLimit: 2 },
        },
        { id: "b1", type: "action", position: { x: 0, y: 150 }, data: { jobType: "notification.create", input: { title: "{{ workflow.item }}" } } },
        { id: "end1", type: "end", position: { x: 0, y: 200 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "t1", target: "map1" },
        { id: "e2", source: "map1", target: "end1" },
      ],
    };

    const { automation, version } = await createAutomationDefinition(fixture.actor, { key: "map-test", name: "Map", category: "test", graph });
    await activateAutomationVersion(fixture.actor, automation.id, version.id);
    const run = await createAutomationRun({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      automationId: automation.id,
      automationVersionId: version.id,
      input: { items: ["a", "b", "c", "d"] },
    });

    const finished = await driveToTerminal(run.id, 60);
    expect(finished.status).toBe("SUCCEEDED");
    const mapOutput = (finished.output as { map1: { results: unknown[] } }).map1;
    expect(mapOutput.results.length).toBe(4);

    const jobs = await prisma.automationJob.findMany({ where: { automationRunId: run.id, jobType: "notification.create" } });
    expect(jobs.length).toBe(4);
    expect(jobs.every((j) => j.status === "SUCCEEDED")).toBe(true);
  });

  it('un noeud "wait" suspend le run puis reprend une fois le délai écoulé', async () => {
    const fixture = await createWorkflowTestFixture("job-executor-wait");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const graph: AutomationGraph = {
      nodes: [
        { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "manual.user_action" } },
        { id: "w1", type: "wait", position: { x: 0, y: 100 }, data: { delayMs: 60_000 } },
        { id: "end1", type: "end", position: { x: 0, y: 200 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "t1", target: "w1" },
        { id: "e2", source: "w1", target: "end1" },
      ],
    };

    const { automation, version } = await createAutomationDefinition(fixture.actor, { key: "wait-test", name: "Attente", category: "test", graph });
    await activateAutomationVersion(fixture.actor, automation.id, version.id);
    const run = await createAutomationRun({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      automationId: automation.id,
      automationVersionId: version.id,
    });

    const suspended = await driveToTerminal(run.id);
    expect(suspended.status).toBe("WAITING");
    expect(suspended.resumeAt).not.toBeNull();

    const results = await processDueAutomationRunWaits(new Date(Date.now() + 120_000));
    expect(results.some((r) => r.runId === run.id && r.ok)).toBe(true);

    const resumed = await prisma.automationRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(resumed.status).toBe("SUCCEEDED");
  });

  it('un noeud "subautomation" déclenche une automatisation enfant et attend son résultat de façon asynchrone', async () => {
    const fixture = await createWorkflowTestFixture("job-executor-subautomation");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const childGraph = linearGraph("notification.create", { title: "Enfant" });
    const { automation: child, version: childVersion } = await createAutomationDefinition(fixture.actor, { key: "child-automation", name: "Enfant", category: "test", graph: childGraph });
    await activateAutomationVersion(fixture.actor, child.id, childVersion.id);

    const parentGraph: AutomationGraph = {
      nodes: [
        { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "manual.user_action" } },
        { id: "sub1", type: "subautomation", position: { x: 0, y: 100 }, data: { automationKey: "child-automation" } },
        { id: "end1", type: "end", position: { x: 0, y: 200 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "t1", target: "sub1" },
        { id: "e2", source: "sub1", target: "end1" },
      ],
    };
    const { automation: parent, version: parentVersion } = await createAutomationDefinition(fixture.actor, { key: "parent-automation", name: "Parent", category: "test", graph: parentGraph });
    await activateAutomationVersion(fixture.actor, parent.id, parentVersion.id);

    const run = await createAutomationRun({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      automationId: parent.id,
      automationVersionId: parentVersion.id,
    });

    const finished = await driveToTerminal(run.id, 60);
    expect(finished.status).toBe("SUCCEEDED");

    const childRun = await prisma.automationRun.findFirstOrThrow({ where: { parentRunId: run.id } });
    expect(childRun.status).toBe("SUCCEEDED");
    expect(childRun.automationId).toBe(child.id);
  });

  it("annule un run en cours et ses jobs non terminaux", async () => {
    const fixture = await createWorkflowTestFixture("job-executor-cancel");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const { automation, version } = await createAutomationDefinition(fixture.actor, {
      key: "cancel-test",
      name: "Annulation",
      category: "test",
      graph: linearGraph("notification.create", { title: "Sera annulé" }),
    });
    await activateAutomationVersion(fixture.actor, automation.id, version.id);
    const run = await createAutomationRun({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      automationId: automation.id,
      automationVersionId: version.id,
    });

    await advanceAutomationRun(run.id); // seed the action job, but never process it.
    const cancelled = await cancelAutomationRun(run.id);
    expect(cancelled.status).toBe("CANCELLED");

    const job = await prisma.automationJob.findFirstOrThrow({ where: { automationRunId: run.id, nodeId: "a1" } });
    expect(job.status).toBe("CANCELLED");
  });

  it("triggerManualAutomationRun amorce un run asynchrone (déclencheur manuel)", async () => {
    const fixture = await createWorkflowTestFixture("job-executor-manual-trigger");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const { automation, version } = await createAutomationDefinition(fixture.actor, {
      key: "manual-trigger-test",
      name: "Déclenchement manuel",
      category: "test",
      graph: linearGraph("notification.create"),
    });
    await activateAutomationVersion(fixture.actor, automation.id, version.id);

    const run = await triggerManualAutomationRun(fixture.actor, automation.id, { hello: "world" });
    expect(run.trigger).toBe("MANUAL");
    expect(["RUNNING", "SUCCEEDED"]).toContain(run.status);

    const finished = await driveToTerminal(run.id);
    expect(finished.status).toBe("SUCCEEDED");
  });

  it("triggerManualAutomationRun échoue si l'automatisation n'a pas de version active", async () => {
    const fixture = await createWorkflowTestFixture("job-executor-manual-trigger-inactive");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const { automation } = await createAutomationDefinition(fixture.actor, {
      key: "manual-trigger-inactive",
      name: "Inactif",
      category: "test",
      graph: linearGraph("notification.create"),
    });

    await expect(triggerManualAutomationRun(fixture.actor, automation.id)).rejects.toThrow(/version active/);
  });

  it("retryAutomationRun crée un nouveau run lié au précédent, seul un run terminé en échec peut être relancé", async () => {
    await recordCircuitSuccess("jobType:sms.send");
    const fixture = await createWorkflowTestFixture("job-executor-retry-run");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const { automation, version } = await createAutomationDefinition(fixture.actor, {
      key: "retry-run-test",
      name: "Relance",
      category: "test",
      graph: linearGraph("sms.send"),
    });
    await activateAutomationVersion(fixture.actor, automation.id, version.id);
    const run = await createAutomationRun({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      automationId: automation.id,
      automationVersionId: version.id,
    });

    await expect(retryAutomationRun(fixture.actor, run.id)).rejects.toThrow(/terminé en échec/);

    const failed = await driveToTerminal(run.id);
    expect(failed.status).toBe("FAILED");

    const retried = await retryAutomationRun(fixture.actor, run.id);
    expect(retried.id).not.toBe(run.id);

    const retriedRow = await prisma.automationRun.findUniqueOrThrow({ where: { id: retried.id } });
    expect(retriedRow.parentRunId).toBe(run.id);
  });
});
