import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { registerAgentRuntime } from "@/lib/agents/registry";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { resolvePlanOrThrow } from "@/lib/agents/director/planning-engine";
import { getPlanGraph } from "@/lib/agents/director/dashboard-service";
import { NotFoundError } from "@/lib/errors";
import { createDirectorTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";
import { expectNoCrossTenantLeak } from "../helpers/tenant-isolation";

const ISOLATION_TARGET_RUNTIME_KEY = "test.director-isolation-target";

/**
 * Isolation multi-tenant du Director (v0.4) : deux organisations distinctes
 * ne doivent jamais voir les plans/étapes l'une de l'autre — même gabarit
 * que `tests/tenant-isolation/agents.test.ts` (v0.3).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("isolation multi-tenant — Agent Director", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const definitionIds: string[] = [];

  beforeAll(() => {
    registerBuiltInAgentComponents();
    registerAgentRuntime({
      runtimeKey: ISOLATION_TARGET_RUNTIME_KEY,
      async execute() {
        return { output: { ok: true } };
      },
    });
  });

  afterAll(async () => {
    await cleanupAgentTestFixtures(organizationIds, userIds, definitionIds);
  });

  async function setupDirectorWithTarget(suffix: string) {
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

    const targetDefinition = await prisma.agentDefinition.create({
      data: {
        organizationId: null,
        key: `test-target-isolation-${suffix}`,
        name: "Cible isolation",
        author: "test",
        category: "system",
        status: "PUBLISHED",
        runtimeKey: ISOLATION_TARGET_RUNTIME_KEY,
        declaredToolKeys: [],
        declaredPermissions: [],
      },
    });
    definitionIds.push(targetDefinition.id);
    const target = await installAgent(fixture.actor, {
      definitionId: targetDefinition.id,
      toolKeys: [],
      permissions: [],
    });
    await transitionInstallation(fixture.actor, target.id, "activate");

    const run = await createAgentRun({
      installationId: directorInstallation.id,
      input: { objective: `objectif ${suffix}`, steps: [{ objective: "sous-tâche", targetInstallationId: target.id }] },
    });
    await executeAgentRun(run.id);
    const plan = await prisma.agentPlan.findUniqueOrThrow({ where: { runId: run.id } });

    return { ...fixture, directorInstallation, target, run, plan };
  }

  it("les plans et étapes d'une organisation sont invisibles à une autre", async () => {
    const fixtureA = await setupDirectorWithTarget("director-isolation-a");
    const fixtureB = await setupDirectorWithTarget("director-isolation-b");

    await expectNoCrossTenantLeak({
      actorAItems: () => prisma.agentPlan.findMany({ where: { workspaceId: fixtureA.workspace.id } }),
      actorBItems: () => prisma.agentPlan.findMany({ where: { workspaceId: fixtureB.workspace.id } }),
      actorAOwnResourceId: fixtureA.plan.id,
      actorBOwnResourceId: fixtureB.plan.id,
      getId: (plan) => plan.id,
    });

    const stepsVisibleToA = await prisma.agentPlanStep.findMany({ where: { plan: { workspaceId: fixtureA.workspace.id } } });
    expect(stepsVisibleToA.every((step) => step.planId === fixtureA.plan.id)).toBe(true);
  });

  it("falsifier l'id d'un plan d'une autre organisation échoue (NotFoundError, pas de fuite d'existence)", async () => {
    const fixtureA = await setupDirectorWithTarget("director-isolation-spoof-a");
    const fixtureB = await setupDirectorWithTarget("director-isolation-spoof-b");

    await expect(resolvePlanOrThrow(fixtureA.workspace.id, fixtureB.plan.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPlanGraph(fixtureA.workspace.id, fixtureB.plan.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
