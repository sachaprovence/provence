import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { resolveProspectForActor, resolveActionForActor } from "@/lib/agents/commercial/commercial-service";
import { NotFoundError } from "@/lib/errors";
import { createCommercialTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";
import { expectNoCrossTenantLeak } from "../helpers/tenant-isolation";

/**
 * Isolation multi-tenant de l'Agent Commercial (v0.5) : deux organisations
 * distinctes ne doivent jamais voir les prospects/actions l'une de
 * l'autre — même gabarit que `tests/tenant-isolation/director.test.ts`
 * (v0.4).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("isolation multi-tenant — Agent Commercial", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const definitionIds: string[] = [];

  beforeAll(() => {
    registerBuiltInAgentComponents();
  });

  afterAll(async () => {
    await cleanupAgentTestFixtures(organizationIds, userIds, definitionIds);
  });

  async function setupWithProspectAndAction(suffix: string) {
    const fixture = await createCommercialTestFixture(suffix);
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    definitionIds.push(fixture.definition.id, fixture.commercialDefinition.id);

    const installation = await installAgent(fixture.actor, {
      definitionId: fixture.commercialDefinition.id,
      toolKeys: ["commercial.create_prospect", "commercial.draft_email"],
      permissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
    });
    await transitionInstallation(fixture.actor, installation.id, "activate");

    const createRun = await createAgentRun({
      installationId: installation.id,
      input: { action: "create_prospect", data: { companyName: `Isolation ${suffix}` } },
    });
    await executeAgentRun(createRun.id);
    const finishedCreate = await prisma.agentRun.findUniqueOrThrow({ where: { id: createRun.id } });
    const prospectId = (finishedCreate.output as { prospect: { id: string } }).prospect.id;

    const emailRun = await createAgentRun({ installationId: installation.id, input: { action: "draft_email", prospectId } });
    await executeAgentRun(emailRun.id);

    const action = await prisma.commercialAction.findFirstOrThrow({ where: { prospectId } });

    return { ...fixture, installation, prospectId, actionId: action.id };
  }

  it("les prospects et actions d'une organisation sont invisibles à une autre", async () => {
    const fixtureA = await setupWithProspectAndAction("commercial-isolation-a");
    const fixtureB = await setupWithProspectAndAction("commercial-isolation-b");

    await expectNoCrossTenantLeak({
      actorAItems: () => prisma.commercialProspect.findMany({ where: { workspaceId: fixtureA.workspace.id } }),
      actorBItems: () => prisma.commercialProspect.findMany({ where: { workspaceId: fixtureB.workspace.id } }),
      actorAOwnResourceId: fixtureA.prospectId,
      actorBOwnResourceId: fixtureB.prospectId,
      getId: (prospect) => prospect.id,
    });

    await expectNoCrossTenantLeak({
      actorAItems: () => prisma.commercialAction.findMany({ where: { workspaceId: fixtureA.workspace.id } }),
      actorBItems: () => prisma.commercialAction.findMany({ where: { workspaceId: fixtureB.workspace.id } }),
      actorAOwnResourceId: fixtureA.actionId,
      actorBOwnResourceId: fixtureB.actionId,
      getId: (action) => action.id,
    });
  });

  it("falsifier l'id d'un prospect ou d'une action d'une autre organisation échoue (NotFoundError, pas de fuite d'existence)", async () => {
    const fixtureA = await setupWithProspectAndAction("commercial-isolation-spoof-a");
    const fixtureB = await setupWithProspectAndAction("commercial-isolation-spoof-b");

    await expect(resolveProspectForActor(fixtureA.actor, fixtureB.prospectId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(resolveActionForActor(fixtureA.actor, fixtureB.actionId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
