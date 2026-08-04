import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { assertAiQuotaAvailable, getAiSpendThisMonthUsd, estimateGenericAiCostUsd } from "@/lib/ai/quota";
import { getAIProviderForOrganization } from "@/lib/ai";
import { QuotaExceededError } from "@/lib/errors";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { ensureBusinessAgentPromptSeeds } from "@/lib/agents/business-agents-prompt-seeds";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { RELANCE_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/relance-agent";
import { createBusinessAgentTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";
import { LeadStage, MessageStatus } from "@/generated/prisma/enums";

/**
 * Quota IA mensuel dur par organisation (v0.9 bis, AR-0051) — vérifie :
 * (1) pas de quota configuré = illimité (comportement inchangé) ; (2) un
 * dépassement bloque explicitement (`QuotaExceededError`, jamais un simple
 * avertissement) ; (3) isolation multi-tenant du quota ; (4) l'application
 * réelle dans les deux couches IA : `src/lib/ai/` (couche historique) ET le
 * Framework des Agents (`generateAgentNarrative`, via un run d'agent réel de
 * bout en bout).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

async function createOrg(suffix: string) {
  return prisma.organization.create({ data: { name: `Org quota ${suffix}` } });
}

async function spend(organizationId: string, amountUsd: number) {
  await prisma.aIRequest.create({
    data: {
      organizationId,
      kind: "ANALYZE_LEAD",
      provider: "demo",
      model: "demo-model",
      prompt: "p",
      response: "r",
      estimatedCostUsd: amountUsd,
      status: "COMPLETED",
    },
  });
}

runIfDatabase("Quota IA — assertAiQuotaAvailable", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  it("ne bloque jamais une organisation sans quota configuré (aiMonthlyBudgetUsd = null)", async () => {
    const organization = await createOrg("no-quota");
    organizationIds.push(organization.id);
    await spend(organization.id, 1000);

    await expect(assertAiQuotaAvailable(organization.id)).resolves.toBeUndefined();
  });

  it("bloque explicitement une organisation ayant atteint son quota", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org quota atteint", aiMonthlyBudgetUsd: 1 } });
    organizationIds.push(organization.id);
    await spend(organization.id, 1);

    await expect(assertAiQuotaAvailable(organization.id)).rejects.toThrow(QuotaExceededError);
    await expect(assertAiQuotaAvailable(organization.id)).rejects.toThrow(/quota/i);
  });

  it("laisse passer une organisation sous son quota", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org quota disponible", aiMonthlyBudgetUsd: 100 } });
    organizationIds.push(organization.id);
    await spend(organization.id, 10);

    await expect(assertAiQuotaAvailable(organization.id)).resolves.toBeUndefined();
    expect(await getAiSpendThisMonthUsd(organization.id)).toBeCloseTo(10, 5);
  });

  it("isolation multi-tenant : le dépassement d'une organisation ne bloque jamais une autre", async () => {
    const orgA = await prisma.organization.create({ data: { name: "Org quota A", aiMonthlyBudgetUsd: 1 } });
    const orgB = await prisma.organization.create({ data: { name: "Org quota B", aiMonthlyBudgetUsd: 1 } });
    organizationIds.push(orgA.id, orgB.id);
    await spend(orgA.id, 5);

    await expect(assertAiQuotaAvailable(orgA.id)).rejects.toThrow(QuotaExceededError);
    await expect(assertAiQuotaAvailable(orgB.id)).resolves.toBeUndefined();
  });

  it("ne compte que les requêtes du mois civil en cours", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org quota historique", aiMonthlyBudgetUsd: 1 } });
    organizationIds.push(organization.id);
    await prisma.aIRequest.create({
      data: {
        organizationId: organization.id,
        kind: "ANALYZE_LEAD",
        provider: "demo",
        model: "demo-model",
        prompt: "p",
        response: "r",
        estimatedCostUsd: 999,
        status: "COMPLETED",
        createdAt: new Date("2020-01-01T00:00:00Z"),
      },
    });

    await expect(assertAiQuotaAvailable(organization.id)).resolves.toBeUndefined();
  });
});

runIfDatabase("Quota IA — getAIProviderForOrganization (couche src/lib/ai/)", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  it("refuse de retourner un fournisseur quand le quota est dépassé", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org quota provider", aiMonthlyBudgetUsd: 1 } });
    organizationIds.push(organization.id);
    await spend(organization.id, 2);

    await expect(getAIProviderForOrganization(organization.id)).rejects.toThrow(QuotaExceededError);
  });

  it("retourne bien un fournisseur quand le quota est disponible", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org quota provider ok", aiMonthlyBudgetUsd: 100 } });
    organizationIds.push(organization.id);

    const provider = await getAIProviderForOrganization(organization.id);
    expect(provider.name).toBe("demo");
  });
});

describe("estimateGenericAiCostUsd", () => {
  it("calcule un coût positif croissant avec la taille du texte", () => {
    expect(estimateGenericAiCostUsd(400, 200)).toBeGreaterThan(0);
    expect(estimateGenericAiCostUsd(4000, 2000)).toBeGreaterThan(estimateGenericAiCostUsd(400, 200));
  });
});

runIfDatabase("Quota IA — Framework des Agents (generateAgentNarrative, via un run réel)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const definitionIds: string[] = [];
  const TOOL_KEYS = ["relance.find_stale_leads", "relance.draft_followup"];

  beforeAll(async () => {
    registerBuiltInAgentComponents();
    await ensureBusinessAgentPromptSeeds();
  });

  afterAll(async () => {
    await cleanupAgentTestFixtures(organizationIds, userIds, definitionIds);
  });

  async function setup(suffix: string, aiMonthlyBudgetUsd?: number) {
    const fixture = await createBusinessAgentTestFixture(suffix, {
      runtimeKey: RELANCE_AGENT_RUNTIME_KEY,
      category: "relance",
      declaredToolKeys: TOOL_KEYS,
      declaredPermissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
    });
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    definitionIds.push(fixture.definition.id, fixture.businessDefinition.id);

    if (aiMonthlyBudgetUsd !== undefined) {
      await prisma.organization.update({ where: { id: fixture.organization.id }, data: { aiMonthlyBudgetUsd } });
    }

    const installation = await installAgent(fixture.actor, {
      definitionId: fixture.businessDefinition.id,
      toolKeys: TOOL_KEYS,
      permissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
    });
    await transitionInstallation(fixture.actor, installation.id, "activate");
    return { ...fixture, installation };
  }

  it("un run d'agent réussit normalement et journalise un AIRequest (kind AGENT_NARRATIVE)", async () => {
    const { installation, organization } = await setup("ok");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "À relancer", stage: LeadStage.FOLLOW_UP_SCHEDULED } });

    const run = await createAgentRun({ installationId: installation.id, input: { action: "draft_followup", leadId: lead.id }, maxAttempts: 1 });
    await executeAgentRun(run.id);
    const finished = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(finished.status).toBe("SUCCEEDED");

    const messages = await prisma.message.findMany({ where: { leadId: lead.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe(MessageStatus.PENDING_VALIDATION);

    const aiRequests = await prisma.aIRequest.findMany({ where: { organizationId: organization.id, kind: "AGENT_NARRATIVE" } });
    expect(aiRequests).toHaveLength(1);
    expect(aiRequests[0].estimatedCostUsd).toBeGreaterThan(0);
  });

  it("un run d'agent échoue explicitement quand le quota de l'organisation est dépassé, sans générer de message", async () => {
    const { installation, organization } = await setup("quota-exceeded", 1);
    await spend(organization.id, 2);
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "À relancer (quota dépassé)", stage: LeadStage.FOLLOW_UP_SCHEDULED } });

    const run = await createAgentRun({ installationId: installation.id, input: { action: "draft_followup", leadId: lead.id }, maxAttempts: 1 });
    await executeAgentRun(run.id);
    const finished = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });

    expect(finished.status).toBe("FAILED");
    expect((finished.error as { message?: string } | null)?.message ?? "").toMatch(/quota/i);

    const messages = await prisma.message.findMany({ where: { leadId: lead.id } });
    expect(messages).toHaveLength(0);
  });
});
