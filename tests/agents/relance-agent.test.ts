import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { ensureBusinessAgentPromptSeeds } from "@/lib/agents/business-agents-prompt-seeds";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { RELANCE_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/relance-agent";
import { createBusinessAgentTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";
import { LeadStage, MessageStatus, MessageType } from "@/generated/prisma/enums";

/**
 * Agent Relance (v0.9) — vérifie qu'il opère sur les VRAIS `Lead`/`Message`
 * (voir ADR 0038 §agents métier), complémentaire du moteur de séquences.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const TOOL_KEYS = ["relance.find_stale_leads", "relance.draft_followup"];

runIfDatabase("Agent Relance", () => {
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

  async function setup(suffix: string) {
    const fixture = await createBusinessAgentTestFixture(suffix, {
      runtimeKey: RELANCE_AGENT_RUNTIME_KEY,
      category: "relance",
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

  it("trouve les vrais prospects restés sans réponse, mais pas ceux récemment contactés", async () => {
    const { installation, organization } = await setup("stale");
    const staleLead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Sans réponse", stage: LeadStage.CONTACTED } });
    await prisma.message.create({
      data: { leadId: staleLead.id, type: MessageType.FIRST_CONTACT_EMAIL, body: "x", status: MessageStatus.SENT, sentAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    });
    const freshLead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Récemment contacté", stage: LeadStage.CONTACTED } });
    await prisma.message.create({
      data: { leadId: freshLead.id, type: MessageType.FIRST_CONTACT_EMAIL, body: "x", status: MessageStatus.SENT, sentAt: new Date() },
    });

    const run = await runAction(installation.id, { action: "find_stale_leads", staleAfterDays: 5 });
    expect(run.status).toBe("SUCCEEDED");
    const ids = (run.output as { leads: { id: string }[] }).leads.map((l) => l.id);
    expect(ids).toContain(staleLead.id);
    expect(ids).not.toContain(freshLead.id);
  });

  it("rédige une relance réelle, jamais envoyée automatiquement", async () => {
    const { installation, organization } = await setup("followup");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "À relancer", stage: LeadStage.FOLLOW_UP_SCHEDULED } });

    const run = await runAction(installation.id, { action: "draft_followup", leadId: lead.id });
    expect(run.status).toBe("SUCCEEDED");

    const messages = await prisma.message.findMany({ where: { leadId: lead.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe(MessageStatus.PENDING_VALIDATION);
    expect(messages[0].type).toBe(MessageType.FOLLOW_UP_SHORT);
  });
});
