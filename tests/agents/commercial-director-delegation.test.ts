import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { ensureCommercialPromptSeeds } from "@/lib/agents/commercial/prompt-seeds";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { COMMERCIAL_AGENT_RUNTIME_KEY } from "@/lib/agents/commercial/constants";
import { AgentDefinitionStatus } from "@/generated/prisma/enums";
import { createDirectorTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";

/**
 * Test d'intégration (nécessite une vraie base PostgreSQL) : le Director
 * (v0.4) délègue réellement du travail à l'Agent Commercial (v0.5) via
 * `targetCategory: "commercial"` — preuve que le premier agent métier
 * s'intègre au Framework/Director sans aucun contournement.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("délégation du Director vers l'Agent Commercial", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const definitionIds: string[] = [];

  beforeAll(async () => {
    registerBuiltInAgentComponents();
    await ensureCommercialPromptSeeds();
  });

  afterAll(async () => {
    await cleanupAgentTestFixtures(organizationIds, userIds, definitionIds);
  });

  it("le Director délègue un cycle complet à l'Agent Commercial et le plan reflète le résultat réel", async () => {
    const fixture = await createDirectorTestFixture("commercial-deleg");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    definitionIds.push(fixture.targetDefinition.id, fixture.directorDefinition.id);

    const directorInstallation = await installAgent(fixture.actor, {
      definitionId: fixture.directorDefinition.id,
      toolKeys: ["director.list_agents", "director.delegate_task", "director.cancel_task", "director.retry_task"],
      permissions: ["VIEW_WORKSPACE"],
    });
    await transitionInstallation(fixture.actor, directorInstallation.id, "activate");

    const commercialDefinition = await prisma.agentDefinition.create({
      data: {
        organizationId: null,
        key: "test-commercial-agent-deleg",
        name: "Commercial (test délégation)",
        author: "test",
        category: "commercial",
        status: AgentDefinitionStatus.PUBLISHED,
        runtimeKey: COMMERCIAL_AGENT_RUNTIME_KEY,
        declaredToolKeys: [
          "commercial.create_prospect",
          "commercial.qualify_prospect",
          "commercial.score_prospect",
          "commercial.estimate_potential",
          "commercial.draft_email",
          "commercial.recommend_next_actions",
        ],
        declaredPermissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
      },
    });
    definitionIds.push(commercialDefinition.id);

    const commercialInstallation = await installAgent(fixture.actor, {
      definitionId: commercialDefinition.id,
      toolKeys: [
        "commercial.create_prospect",
        "commercial.qualify_prospect",
        "commercial.score_prospect",
        "commercial.estimate_potential",
        "commercial.draft_email",
        "commercial.recommend_next_actions",
      ],
      permissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
    });
    await transitionInstallation(fixture.actor, commercialInstallation.id, "activate");

    const run = await createAgentRun({
      installationId: directorInstallation.id,
      input: {
        objective: "traiter un nouveau prospect entrant",
        steps: [
          {
            objective: "traiter Delegation SARL de bout en bout",
            targetInstallationId: commercialInstallation.id,
            input: { action: "full_cycle", data: { companyName: "Delegation SARL", sector: "finance" } },
          },
        ],
      },
    });
    await executeAgentRun(run.id);

    const finishedRun = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(finishedRun.status).toBe("SUCCEEDED");

    const plan = await prisma.agentPlan.findUniqueOrThrow({ where: { runId: run.id }, include: { steps: true } });
    expect(plan.status).toBe("SUCCEEDED");
    expect(plan.steps[0].status).toBe("SUCCEEDED");

    // Le résultat n'est pas seulement rapporté par le plan : le travail a réellement eu lieu.
    const prospect = await prisma.commercialProspect.findFirstOrThrow({
      where: { installationId: commercialInstallation.id, companyName: "Delegation SARL" },
    });
    expect(prospect.stage).toBe("QUALIFIED");
    expect(prospect.score).not.toBeNull();

    const emailAction = await prisma.commercialAction.findFirstOrThrow({
      where: { prospectId: prospect.id, type: "EMAIL_DRAFT" },
    });
    expect(emailAction.status).toBe("PENDING_APPROVAL");
  });
});
