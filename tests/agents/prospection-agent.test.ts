import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { ensureBusinessAgentPromptSeeds } from "@/lib/agents/business-agents-prompt-seeds";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { PROSPECTION_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/prospection-agent";
import { createBusinessAgentTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";
import { LeadStage, MessageStatus } from "@/generated/prisma/enums";

/**
 * Agent Prospection (v0.9) — vérifie qu'il opère sur les VRAIES données
 * CRM (`Lead`/`LeadScore`/`Message`), jamais un modèle séparé de
 * démonstration (voir ADR 0038 §agents métier).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const TOOL_KEYS = ["prospection.find_priority_leads", "prospection.score_lead", "prospection.draft_outreach"];

runIfDatabase("Agent Prospection", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const definitionIds: string[] = [];

  beforeAll(async () => {
    registerBuiltInAgentComponents();
    await ensureBusinessAgentPromptSeeds();
  });

  afterAll(async () => {
    await cleanupAgentTestFixtures(organizationIds, userIds, definitionIds);
  });

  async function setup(suffix: string, permissions = ["MANAGE_LEADS", "VIEW_WORKSPACE"]) {
    const fixture = await createBusinessAgentTestFixture(suffix, {
      runtimeKey: PROSPECTION_AGENT_RUNTIME_KEY,
      category: "prospection",
      declaredToolKeys: TOOL_KEYS,
      declaredPermissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
    });
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    definitionIds.push(fixture.definition.id, fixture.businessDefinition.id);

    const installation = await installAgent(fixture.actor, {
      definitionId: fixture.businessDefinition.id,
      toolKeys: TOOL_KEYS,
      permissions,
    });
    await transitionInstallation(fixture.actor, installation.id, "activate");
    return { ...fixture, installation };
  }

  async function runAction(installationId: string, input: unknown) {
    const run = await createAgentRun({ installationId, input, maxAttempts: 1 });
    await executeAgentRun(run.id);
    return prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
  }

  it("liste les vrais prospects non travaillés, triés par score", async () => {
    const { installation, organization } = await setup("find-priority");
    const leadLow = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Bas score", stage: LeadStage.NEW } });
    const leadHigh = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Haut score", stage: LeadStage.NEW } });
    await prisma.leadScore.create({ data: { leadId: leadLow.id, value: 20, category: "LOW", breakdown: {} } });
    await prisma.leadScore.create({ data: { leadId: leadHigh.id, value: 90, category: "HIGH", breakdown: {} } });

    const run = await runAction(installation.id, { action: "find_priority_leads" });
    expect(run.status).toBe("SUCCEEDED");
    const leads = (run.output as { leads: { id: string; score: number | null }[] }).leads;
    expect(leads[0].id).toBe(leadHigh.id);
    expect(leads.map((l) => l.id)).toContain(leadLow.id);
  });

  it("calcule un vrai score et l'enregistre dans LeadScore (même moteur que /api/leads/[id]/score)", async () => {
    const { installation, organization } = await setup("score");
    const lead = await prisma.lead.create({
      data: { organizationId: organization.id, establishmentName: "À scorer", category: "HOTEL", hasVirtualTour: false },
    });

    const run = await runAction(installation.id, { action: "score_lead", leadId: lead.id });
    expect(run.status).toBe("SUCCEEDED");

    const scores = await prisma.leadScore.findMany({ where: { leadId: lead.id } });
    expect(scores).toHaveLength(1);
    expect(scores[0].value).toBe((run.output as { score: number }).score);
  });

  it("rédige un message de prise de contact réel, jamais envoyé automatiquement", async () => {
    const { installation, organization } = await setup("outreach");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Nouveau contact" } });

    const run = await runAction(installation.id, { action: "draft_outreach", leadId: lead.id });
    expect(run.status).toBe("SUCCEEDED");

    const messages = await prisma.message.findMany({ where: { leadId: lead.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe(MessageStatus.PENDING_VALIDATION);
    expect(messages[0].type).toBe("FIRST_CONTACT_EMAIL");
  });

  it("refuse d'agir sans la permission MANAGE_LEADS accordée à l'installation", async () => {
    const { installation, organization } = await setup("no-permission", ["VIEW_WORKSPACE"]);
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Protégé" } });

    const run = await runAction(installation.id, { action: "draft_outreach", leadId: lead.id });
    expect(run.status).toBe("FAILED");
    expect((run.error as { message: string } | null)?.message).toMatch(/n'est pas autorisé/);
  });
});
