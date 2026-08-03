import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { ensureBusinessAgentPromptSeeds } from "@/lib/agents/business-agents-prompt-seeds";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { SUPPORT_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/support-agent";
import { createBusinessAgentTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";
import { MessageStatus, MessageType } from "@/generated/prisma/enums";

/**
 * Agent Support (v0.9) — promeut le stub `future-support-agent` (v0.4) en
 * agent réel. Vérifie qu'il opère sur les VRAIS `Conversation`/`Message`
 * (voir ADR 0038 §agents métier).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const TOOL_KEYS = ["support.summarize_conversation", "support.draft_reply"];

runIfDatabase("Agent Support", () => {
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
      runtimeKey: SUPPORT_AGENT_RUNTIME_KEY,
      category: "support",
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

  it("résume le vrai historique de conversation d'un lead", async () => {
    const { installation, organization } = await setup("summarize");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client support" } });
    await prisma.conversation.create({ data: { leadId: lead.id, direction: "inbound", body: "Bonjour, quel est le délai ?" } });

    const run = await runAction(installation.id, { action: "summarize_conversation", leadId: lead.id });
    expect(run.status).toBe("SUCCEEDED");
    expect((run.output as { messageCount: number }).messageCount).toBe(1);
  });

  it("rédige une vraie réponse au dernier message entrant, jamais envoyée automatiquement", async () => {
    const { installation, organization } = await setup("reply");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client à répondre" } });
    await prisma.conversation.create({ data: { leadId: lead.id, direction: "inbound", body: "Pouvez-vous m'envoyer un devis ?", subject: "Question" } });

    const run = await runAction(installation.id, { action: "draft_reply", leadId: lead.id });
    expect(run.status).toBe("SUCCEEDED");

    const messages = await prisma.message.findMany({ where: { leadId: lead.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe(MessageStatus.PENDING_VALIDATION);
    expect(messages[0].type).toBe(MessageType.FOLLOW_UP_SHORT);
    expect(messages[0].subject).toBe("Re: Question");
  });

  it("rejette la rédaction d'une réponse s'il n'y a aucun message entrant", async () => {
    const { installation, organization } = await setup("no-inbound");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Sans échange" } });

    const run = await runAction(installation.id, { action: "draft_reply", leadId: lead.id });
    expect(run.status).toBe("FAILED");
    expect((run.error as { message: string } | null)?.message).toMatch(/Aucun message entrant/);
  });
});
