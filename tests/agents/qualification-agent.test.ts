import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { ensureCommercialPromptSeeds } from "@/lib/agents/commercial/prompt-seeds";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { QUALIFICATION_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/qualification-agent";
import { createCommercialTestFixture, createBusinessAgentTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";

/**
 * Agent Qualification (v1.1, AR-0173) — extrait de l'Agent Commercial pour
 * être orchestrable indépendamment, sans dupliquer le moteur de scoring
 * (`scoring-engine.ts`) : réutilise directement les outils
 * `commercial.score_prospect`/`commercial.qualify_prospect`.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const TOOL_KEYS = ["commercial.score_prospect", "commercial.qualify_prospect"];

runIfDatabase("Agent Qualification", () => {
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

  async function setupQualification(suffix: string) {
    const fixture = await createBusinessAgentTestFixture(suffix, {
      runtimeKey: QUALIFICATION_AGENT_RUNTIME_KEY,
      category: "qualification",
      declaredToolKeys: TOOL_KEYS,
      declaredPermissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
    });
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    definitionIds.push(fixture.definition.id, fixture.businessDefinition.id);

    const installation = await installAgent(fixture.actor, {
      definitionId: fixture.businessDefinition.id,
      toolKeys: TOOL_KEYS,
      permissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
    });
    await transitionInstallation(fixture.actor, installation.id, "activate");
    return { ...fixture, installation };
  }

  async function runAction(installationId: string, input: unknown) {
    const run = await createAgentRun({ installationId, input, maxAttempts: 1 });
    await executeAgentRun(run.id);
    return prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
  }

  it("qualifie un prospect à faible score en TO_QUALIFY, un prospect à fort score en QUALIFIED", async () => {
    const { installation, organization, workspace } = await setupQualification("thresholds");

    const weakProspect = await prisma.commercialProspect.create({
      data: { organizationId: organization.id, workspaceId: workspace.id, installationId: installation.id, companyName: "Faible potentiel" },
    });
    const strongProspect = await prisma.commercialProspect.create({
      data: {
        organizationId: organization.id,
        workspaceId: workspace.id,
        installationId: installation.id,
        companyName: "Fort potentiel",
        companySize: "250+",
        sector: "finance",
        website: "https://strong.example",
      },
    });

    const weakRun = await runAction(installation.id, { prospectId: weakProspect.id });
    expect(weakRun.status).toBe("SUCCEEDED");
    expect((weakRun.output as { stage: string }).stage).toBe("TO_QUALIFY");

    const strongRun = await runAction(installation.id, { prospectId: strongProspect.id });
    expect(strongRun.status).toBe("SUCCEEDED");
    expect((strongRun.output as { stage: string }).stage).toBe("QUALIFIED");

    const strongAfter = await prisma.commercialProspect.findUniqueOrThrow({ where: { id: strongProspect.id } });
    expect(strongAfter.stage).toBe("QUALIFIED");
    expect(strongAfter.score).toBe((strongRun.output as { score: number }).score);
  });

  it("produit le même score que l'Agent Commercial pour des faits identiques (même moteur de scoring, jamais dupliqué)", async () => {
    const commercialFixture = await createCommercialTestFixture("parity-commercial");
    organizationIds.push(commercialFixture.organization.id);
    userIds.push(commercialFixture.user.id);
    definitionIds.push(commercialFixture.definition.id, commercialFixture.commercialDefinition.id);

    const commercialInstallation = await installAgent(commercialFixture.actor, {
      definitionId: commercialFixture.commercialDefinition.id,
      toolKeys: ["commercial.create_prospect", "commercial.score_prospect"],
      permissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
    });
    await transitionInstallation(commercialFixture.actor, commercialInstallation.id, "activate");

    const createRun = await runAction(commercialInstallation.id, {
      action: "create_prospect",
      data: { companyName: "Parité SARL", sector: "technologie", companySize: "50-249", website: "https://parite.example" },
    });
    const commercialProspectId = (createRun.output as { prospect: { id: string } }).prospect.id;
    const commercialScoreRun = await runAction(commercialInstallation.id, { action: "score_prospect", prospectId: commercialProspectId });
    const commercialScore = (commercialScoreRun.output as { score: number }).score;

    const { installation, organization, workspace } = await setupQualification("parity-qualification");
    const qualificationProspect = await prisma.commercialProspect.create({
      data: {
        organizationId: organization.id,
        workspaceId: workspace.id,
        installationId: installation.id,
        companyName: "Parité identique SARL",
        sector: "technologie",
        companySize: "50-249",
        website: "https://parite.example",
      },
    });
    const qualificationRun = await runAction(installation.id, { prospectId: qualificationProspect.id });
    const qualificationScore = (qualificationRun.output as { score: number }).score;

    expect(qualificationScore).toBe(commercialScore);
  });

  it("transmet les notes de qualification fournies", async () => {
    const { installation, organization, workspace } = await setupQualification("notes");
    const prospect = await prisma.commercialProspect.create({
      data: { organizationId: organization.id, workspaceId: workspace.id, installationId: installation.id, companyName: "Notes SARL" },
    });

    const run = await runAction(installation.id, { prospectId: prospect.id, notes: "Qualifié via l'Agent Qualification dédié." });
    expect(run.status).toBe("SUCCEEDED");

    const after = await prisma.commercialProspect.findUniqueOrThrow({ where: { id: prospect.id } });
    expect(after.qualificationNotes).toBe("Qualifié via l'Agent Qualification dédié.");
  });
});
