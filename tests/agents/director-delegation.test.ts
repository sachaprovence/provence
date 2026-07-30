import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { registerAgentRuntime } from "@/lib/agents/registry";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { createPlan } from "@/lib/agents/director/planning-engine";
import { delegateStep, cancelStepDelegation, retryStepDelegation } from "@/lib/agents/director/delegation-engine";
import { delegateTaskTool } from "@/lib/agents/tools/director-tools";
import { ValidationError, NotFoundError } from "@/lib/errors";
import { AgentDefinitionStatus } from "@/generated/prisma/enums";
import { createDirectorTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";

const SUCCESS_RUNTIME_KEY = "test.director-target-success";
const SLOW_RUNTIME_KEY = "test.director-target-slow";
const ALWAYS_FAIL_RUNTIME_KEY = "test.director-target-always-fail";
const FAIL_ONCE_RUNTIME_KEY = "test.director-target-fail-once";

const failOnceAttempts = new Map<string, number>();

/**
 * Test d'intégration (nécessite une vraie base PostgreSQL) : moteur de
 * délégation de l'Agent Director (v0.4) — appel d'un agent, exécution
 * séquentielle/parallèle selon les dépendances, gestion des erreurs,
 * timeout, annulation, relance, vérification des permissions, cloisonnement
 * des plans entre agents.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("moteur de délégation de l'Agent Director", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const definitionIds: string[] = [];

  beforeAll(() => {
    registerBuiltInAgentComponents();
    registerAgentRuntime({
      runtimeKey: SUCCESS_RUNTIME_KEY,
      async execute(context) {
        return { output: { received: context.input } };
      },
    });
    registerAgentRuntime({
      runtimeKey: SLOW_RUNTIME_KEY,
      async execute() {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return { output: {} };
      },
    });
    registerAgentRuntime({
      runtimeKey: ALWAYS_FAIL_RUNTIME_KEY,
      async execute() {
        throw new Error("échec permanent simulé");
      },
    });
    registerAgentRuntime({
      runtimeKey: FAIL_ONCE_RUNTIME_KEY,
      async execute(context) {
        const key = (context.input as { attemptKey: string }).attemptKey;
        const attempts = (failOnceAttempts.get(key) ?? 0) + 1;
        failOnceAttempts.set(key, attempts);
        if (attempts === 1) throw new Error("échec simulé (première tentative)");
        return { output: { attempts } };
      },
    });
  });

  afterAll(async () => {
    await cleanupAgentTestFixtures(organizationIds, userIds, definitionIds);
  });

  async function setupDirector(suffix: string) {
    const fixture = await createDirectorTestFixture(suffix);
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    definitionIds.push(fixture.targetDefinition.id, fixture.directorDefinition.id);

    const directorInstallation = await installAgent(fixture.actor, {
      definitionId: fixture.directorDefinition.id,
      toolKeys: ["director.list_agents", "director.delegate_task", "director.cancel_task", "director.retry_task"],
      permissions: ["VIEW_WORKSPACE"],
    });
    await transitionInstallation(fixture.actor, directorInstallation.id, "activate");

    return { ...fixture, directorInstallation };
  }

  async function installTargetAgent(
    actor: Awaited<ReturnType<typeof setupDirector>>["actor"],
    opts: { suffix: string; runtimeKey: string; category?: string; toolKeys?: string[]; permissions?: string[] }
  ) {
    const definition = await prisma.agentDefinition.create({
      data: {
        organizationId: null,
        key: `test-target-${opts.suffix}`,
        name: `Cible ${opts.suffix}`,
        author: "test",
        category: opts.category ?? "system",
        status: AgentDefinitionStatus.PUBLISHED,
        runtimeKey: opts.runtimeKey,
        declaredToolKeys: opts.toolKeys ?? [],
        declaredPermissions: opts.permissions ?? [],
      },
    });
    definitionIds.push(definition.id);

    const installation = await installAgent(actor, {
      definitionId: definition.id,
      toolKeys: opts.toolKeys ?? [],
      permissions: opts.permissions ?? [],
    });
    await transitionInstallation(actor, installation.id, "activate");
    return { definition, installation };
  }

  it("délègue une étape unique avec succès et historise la demande et le résultat", async () => {
    const { actor, directorInstallation } = await setupDirector("deleg-success");
    const { installation: target } = await installTargetAgent(actor, {
      suffix: "deleg-success",
      runtimeKey: SUCCESS_RUNTIME_KEY,
    });

    const run = await createAgentRun({
      installationId: directorInstallation.id,
      input: { objective: "traiter la tâche", steps: [{ objective: "sous-tâche", targetInstallationId: target.id }] },
    });
    await executeAgentRun(run.id);

    const finishedRun = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(finishedRun.status).toBe("SUCCEEDED");

    const plan = await prisma.agentPlan.findUniqueOrThrow({
      where: { runId: run.id },
      include: { steps: true },
    });
    expect(plan.status).toBe("SUCCEEDED");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].status).toBe("SUCCEEDED");
    expect(plan.steps[0].subRunId).not.toBeNull();

    const subRun = await prisma.agentRun.findUniqueOrThrow({ where: { id: plan.steps[0].subRunId! } });
    expect(subRun.installationId).toBe(target.id);
    expect(subRun.trigger).toBe("AGENT");
    expect(subRun.status).toBe("SUCCEEDED");

    const messages = await prisma.agentMessage.findMany({ where: { runId: subRun.id } });
    expect(messages.some((m) => m.type === "TASK_REQUEST")).toBe(true);
    expect(messages.some((m) => m.type === "RESULT")).toBe(true);

    const logs = await prisma.agentRunLog.findMany({ where: { runId: run.id } });
    expect(logs.some((l) => l.message.includes("Plan généré"))).toBe(true);
    expect(logs.some((l) => l.message.includes("Plan terminé"))).toBe(true);
  });

  it("exécute deux étapes indépendantes (sans dépendance) en parallèle", async () => {
    const { actor, directorInstallation } = await setupDirector("deleg-parallel");
    const { installation: targetA } = await installTargetAgent(actor, {
      suffix: "parallel-a",
      runtimeKey: SUCCESS_RUNTIME_KEY,
    });
    const { installation: targetB } = await installTargetAgent(actor, {
      suffix: "parallel-b",
      runtimeKey: SUCCESS_RUNTIME_KEY,
    });

    const run = await createAgentRun({
      installationId: directorInstallation.id,
      input: {
        objective: "deux tâches indépendantes",
        steps: [
          { objective: "tâche A", targetInstallationId: targetA.id },
          { objective: "tâche B", targetInstallationId: targetB.id },
        ],
      },
    });
    await executeAgentRun(run.id);

    const plan = await prisma.agentPlan.findUniqueOrThrow({ where: { runId: run.id }, include: { steps: true } });
    expect(plan.status).toBe("SUCCEEDED");
    expect(plan.steps.every((s) => s.status === "SUCCEEDED")).toBe(true);
    expect(new Set(plan.steps.map((s) => s.subRunId))).toHaveProperty("size", 2);
  });

  it("respecte les dépendances : une étape séquentielle n'est déléguée qu'après le succès de sa dépendance", async () => {
    const { actor, directorInstallation } = await setupDirector("deleg-sequential");
    const { installation: targetA } = await installTargetAgent(actor, {
      suffix: "sequential-a",
      runtimeKey: SUCCESS_RUNTIME_KEY,
    });
    const { installation: targetB } = await installTargetAgent(actor, {
      suffix: "sequential-b",
      runtimeKey: SUCCESS_RUNTIME_KEY,
    });

    const run = await createAgentRun({
      installationId: directorInstallation.id,
      input: {
        objective: "séquence de deux tâches",
        steps: [
          { objective: "étape 1", targetInstallationId: targetA.id },
          { objective: "étape 2", targetInstallationId: targetB.id, dependsOn: [0] },
        ],
      },
    });
    await executeAgentRun(run.id);

    const plan = await prisma.agentPlan.findUniqueOrThrow({
      where: { runId: run.id },
      include: { steps: { orderBy: { stepIndex: "asc" } } },
    });
    expect(plan.steps.every((s) => s.status === "SUCCEEDED")).toBe(true);
    expect(plan.steps[0].finishedAt!.getTime()).toBeLessThanOrEqual(plan.steps[1].startedAt!.getTime());
  });

  it("gère l'erreur d'un agent délégué : l'étape et le plan échouent, mais le run du Director réussit avec une intervention demandée", async () => {
    const { actor, directorInstallation } = await setupDirector("deleg-error");
    const { installation: target } = await installTargetAgent(actor, {
      suffix: "always-fail",
      runtimeKey: ALWAYS_FAIL_RUNTIME_KEY,
    });

    const run = await createAgentRun({
      installationId: directorInstallation.id,
      input: { objective: "tâche vouée à l'échec", steps: [{ objective: "sous-tâche", targetInstallationId: target.id }] },
    });
    await executeAgentRun(run.id);

    const finishedRun = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(finishedRun.status).toBe("SUCCEEDED"); // le Director a bien orchestré, même si le plan a échoué

    const plan = await prisma.agentPlan.findUniqueOrThrow({ where: { runId: run.id }, include: { steps: true } });
    expect(plan.status).toBe("FAILED");
    expect(plan.steps[0].status).toBe("FAILED");
    expect(JSON.stringify(plan.steps[0].error)).toContain("échec permanent simulé");

    const intervention = await prisma.agentInterventionRequest.findFirst({
      where: { installationId: directorInstallation.id, runId: run.id },
    });
    expect(intervention).not.toBeNull();
  });

  it("applique un timeout à une étape déléguée", async () => {
    const { actor, directorInstallation, workspace } = await setupDirector("deleg-timeout");
    const { installation: target } = await installTargetAgent(actor, {
      suffix: "slow",
      runtimeKey: SLOW_RUNTIME_KEY,
    });

    const plan = await createPlan({
      workspaceId: workspace.id,
      installationId: directorInstallation.id,
      goal: "timeout",
      steps: [{ objective: "sous-tâche lente", targetInstallationId: target.id }],
    });

    const updated = await delegateStep(directorInstallation, plan.steps[0], { timeoutMs: 50, maxAttempts: 1 });
    expect(updated.status).toBe("FAILED");
    expect(JSON.stringify(updated.error)).toContain("AGENT_RUN_TIMEOUT");
  });

  it("relance une étape échouée : la nouvelle tentative réussit et reste reliée à la précédente (lignée)", async () => {
    const { actor, directorInstallation, workspace } = await setupDirector("deleg-retry");
    const { installation: target } = await installTargetAgent(actor, {
      suffix: "fail-once",
      runtimeKey: FAIL_ONCE_RUNTIME_KEY,
    });

    const plan = await createPlan({
      workspaceId: workspace.id,
      installationId: directorInstallation.id,
      goal: "relance",
      steps: [
        {
          objective: "sous-tâche capricieuse",
          targetInstallationId: target.id,
          input: { attemptKey: "retry-lineage-key" },
        },
      ],
    });

    const failed = await delegateStep(directorInstallation, plan.steps[0]);
    expect(failed.status).toBe("FAILED");
    const firstSubRunId = failed.subRunId;

    const retried = await retryStepDelegation(directorInstallation, failed);
    expect(retried.status).toBe("SUCCEEDED");
    expect(retried.result).toEqual({ attempts: 2 });
    expect(retried.subRunId).not.toBe(firstSubRunId);

    const newSubRun = await prisma.agentRun.findUniqueOrThrow({ where: { id: retried.subRunId! } });
    expect(newSubRun.parentRunId).toBe(firstSubRunId);

    await expect(retryStepDelegation(directorInstallation, retried)).rejects.toBeInstanceOf(ValidationError);
  });

  it("annule une étape jamais déléguée ; une étape déjà terminée ne peut plus être annulée", async () => {
    const { directorInstallation, workspace } = await setupDirector("deleg-cancel");

    const plan = await createPlan({
      workspaceId: workspace.id,
      installationId: directorInstallation.id,
      goal: "annulation",
      steps: [{ objective: "jamais lancée", targetCategory: "system" }],
    });

    const cancelled = await cancelStepDelegation(plan.steps[0]);
    expect(cancelled.status).toBe("CANCELLED");
    await expect(cancelStepDelegation(cancelled)).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuse de déléguer une étape à un agent qui n'a pas les outils/permissions requis", async () => {
    const { actor, directorInstallation, workspace } = await setupDirector("deleg-permissions");
    const { installation: target } = await installTargetAgent(actor, {
      suffix: "no-grants",
      runtimeKey: SUCCESS_RUNTIME_KEY,
      toolKeys: [],
      permissions: [],
    });

    const plan = await createPlan({
      workspaceId: workspace.id,
      installationId: directorInstallation.id,
      goal: "permissions",
      steps: [
        {
          objective: "nécessite un outil non accordé",
          targetInstallationId: target.id,
          requiredToolKeys: ["crm.leads_count_by_stage"],
          requiredPermissions: ["MANAGE_LEADS"],
        },
      ],
    });

    const updated = await delegateStep(directorInstallation, plan.steps[0]);
    expect(updated.status).toBe("FAILED");
    const error = updated.error as { missingTools: string[]; missingPermissions: string[] };
    expect(error.missingTools).toContain("crm.leads_count_by_stage");
    expect(error.missingPermissions).toContain("MANAGE_LEADS");
  });

  it("un agent ne peut piloter que les étapes de son propre plan (isolation entre orchestrateurs)", async () => {
    const ownerA = await setupDirector("deleg-owner-a");
    const ownerB = await setupDirector("deleg-owner-b");

    const planA = await createPlan({
      workspaceId: ownerA.workspace.id,
      installationId: ownerA.directorInstallation.id,
      goal: "plan de A",
      steps: [{ objective: "étape de A", targetCategory: "system" }],
    });

    const fakeRunForB = await createAgentRun({ installationId: ownerB.directorInstallation.id });

    await expect(
      delegateTaskTool.handle(
        { stepId: planA.steps[0].id },
        { installation: ownerB.directorInstallation, run: fakeRunForB }
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
