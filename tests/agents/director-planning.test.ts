import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { installAgent } from "@/lib/agents/installation-service";
import {
  createPlan,
  getPlan,
  getReadySteps,
  updateStepStatus,
  mergePlanResults,
} from "@/lib/agents/director/planning-engine";
import { ValidationError } from "@/lib/errors";
import { createAgentTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";

/**
 * Test d'intégration (nécessite une vraie base PostgreSQL) : moteur de
 * planification du Director (v0.4) — validation du DAG à la création,
 * résolution des étapes prêtes, propagation en cascade des échecs,
 * fusion des résultats. N'exerce pas le runtime du Director lui-même (voir
 * `director-delegation.test.ts`), seulement `planning-engine.ts`.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("moteur de planification du Director", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const definitionIds: string[] = [];

  beforeAll(() => {
    registerBuiltInAgentComponents();
  });

  afterAll(async () => {
    await cleanupAgentTestFixtures(organizationIds, userIds, definitionIds);
  });

  async function installedFixture(suffix: string) {
    const fixture = await createAgentTestFixture(suffix);
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    definitionIds.push(fixture.definition.id);
    const installation = await installAgent(fixture.actor, {
      definitionId: fixture.definition.id,
      toolKeys: [],
      permissions: [],
    });
    return { ...fixture, installation };
  }

  it("refuse un plan sans étape", async () => {
    const { workspace, installation } = await installedFixture("plan-empty");
    await expect(
      createPlan({ workspaceId: workspace.id, installationId: installation.id, goal: "x", steps: [] })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuse une étape sans cible (ni targetInstallationId ni targetCategory)", async () => {
    const { workspace, installation } = await installedFixture("plan-no-target");
    await expect(
      createPlan({
        workspaceId: workspace.id,
        installationId: installation.id,
        goal: "x",
        steps: [{ objective: "faire quelque chose" }],
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuse une dépendance en avant ou sur soi-même (garantit l'absence de cycle)", async () => {
    const { workspace, installation } = await installedFixture("plan-bad-dep");
    await expect(
      createPlan({
        workspaceId: workspace.id,
        installationId: installation.id,
        goal: "x",
        steps: [
          { objective: "étape 0", targetCategory: "system", dependsOn: [0] }, // dépend d'elle-même
        ],
      })
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      createPlan({
        workspaceId: workspace.id,
        installationId: installation.id,
        goal: "x",
        steps: [
          { objective: "étape 0", targetCategory: "system", dependsOn: [1] }, // référence en avant
          { objective: "étape 1", targetCategory: "system" },
        ],
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("résout les dépendances par id réel et ne renvoie prêtes que les étapes sans dépendance en attente", async () => {
    const { workspace, installation } = await installedFixture("plan-ready");
    const plan = await createPlan({
      workspaceId: workspace.id,
      installationId: installation.id,
      goal: "objectif",
      steps: [
        { objective: "étape 0", targetCategory: "system" },
        { objective: "étape 1", targetCategory: "system", dependsOn: [0] },
      ],
    });
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[1].dependsOnStepIds).toEqual([plan.steps[0].id]);

    const readyFirst = await getReadySteps(plan.id);
    expect(readyFirst.map((s) => s.id)).toEqual([plan.steps[0].id]);

    await updateStepStatus(plan.steps[0].id, { status: "SUCCEEDED", finishedAt: new Date() });
    const readySecond = await getReadySteps(plan.id);
    expect(readySecond.map((s) => s.id)).toEqual([plan.steps[1].id]);
  });

  it("propage l'échec en cascade : une étape dont la dépendance a échoué est ignorée (SKIPPED), jamais bloquée indéfiniment", async () => {
    const { workspace, installation } = await installedFixture("plan-cascade");
    const plan = await createPlan({
      workspaceId: workspace.id,
      installationId: installation.id,
      goal: "objectif",
      steps: [
        { objective: "étape 0", targetCategory: "system" },
        { objective: "étape 1", targetCategory: "system", dependsOn: [0] },
      ],
    });

    await updateStepStatus(plan.steps[0].id, { status: "FAILED", finishedAt: new Date() });
    const ready = await getReadySteps(plan.id);
    expect(ready).toHaveLength(0);

    const finalPlan = await getPlan(plan.id);
    const merged = mergePlanResults(finalPlan);
    expect(merged.skippedCount).toBe(1);
    expect(merged.failedCount).toBe(1);
  });
});
