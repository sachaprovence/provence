import { afterAll, describe, expect, it } from "vitest";
import { getUnifiedOverview } from "@/lib/dashboards/unified-overview-service";
import { createCustomAgent } from "@/lib/agents/custom/custom-agent-service";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

/** Tableau de bord unifié (v1.6-6) : agrège des services déjà testés ailleurs — vérifie surtout que l'agrégation elle-même est correcte et isolée par workspace. */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("unified-overview-service (v1.6-6)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("reflète les agents personnalisés créés dans ce workspace", async () => {
    const fixture = await createWorkflowTestFixture("unified-overview-agents");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const before = await getUnifiedOverview(fixture.actor);
    expect(before.agents.custom).toBe(0);

    await createCustomAgent(fixture.actor, { name: "Agent overview" });
    const after = await getUnifiedOverview(fixture.actor);
    expect(after.agents.custom).toBe(1);
  });

  it("isole les comptages par workspace", async () => {
    const fixtureA = await createWorkflowTestFixture("unified-overview-isolation-a");
    const fixtureB = await createWorkflowTestFixture("unified-overview-isolation-b");
    organizationIds.push(fixtureA.organization.id, fixtureB.organization.id);
    userIds.push(fixtureA.user.id, fixtureB.user.id);

    await createCustomAgent(fixtureA.actor, { name: "Agent A" });

    const overviewB = await getUnifiedOverview(fixtureB.actor);
    expect(overviewB.agents.custom).toBe(0);
  });
});
