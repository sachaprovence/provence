import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { ensureBusinessAgentPromptSeeds } from "@/lib/agents/business-agents-prompt-seeds";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { DEVIS_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/devis-agent";
import { createBusinessAgentTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";
import { QuoteStatus, ServiceKind } from "@/generated/prisma/enums";

/**
 * Agent Devis (v0.9) — vérifie qu'il réutilise le VRAI service de devis
 * (`@/lib/crm/quote-service`, task #83), jamais une réimplémentation
 * séparée (voir ADR 0038 §agents métier).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const TOOL_KEYS = ["devis.draft_quote", "devis.send_quote", "devis.recommend_pricing"];

runIfDatabase("Agent Devis", () => {
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
      runtimeKey: DEVIS_AGENT_RUNTIME_KEY,
      category: "devis",
      declaredToolKeys: TOOL_KEYS,
      declaredPermissions: ["MANAGE_FINANCE", "VIEW_WORKSPACE"],
    });
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    definitionIds.push(fixture.definition.id, fixture.businessDefinition.id);

    const installation = await installAgent(fixture.actor, {
      definitionId: fixture.businessDefinition.id,
      toolKeys: TOOL_KEYS,
      permissions: ["MANAGE_FINANCE", "VIEW_WORKSPACE"],
    });
    await transitionInstallation(fixture.actor, installation.id, "activate");
    return { ...fixture, installation };
  }

  async function runAction(installationId: string, input: unknown) {
    const run = await createAgentRun({ installationId, input, maxAttempts: 1 });
    await executeAgentRun(run.id);
    return prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
  }

  it("crée un vrai devis (même service que /quotes) puis l'envoie (version figée)", async () => {
    const { installation, organization } = await setup("draft-send");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client devis" } });
    const service = await prisma.service.create({
      data: { organizationId: organization.id, kind: ServiceKind.VIRTUAL_TOUR_SIMPLE, name: "Visite simple", basePrice: 25000 },
    });

    const draftRun = await runAction(installation.id, { action: "draft_quote", leadId: lead.id, serviceId: service.id, quantity: 2 });
    expect(draftRun.status).toBe("SUCCEEDED");
    const quoteId = (draftRun.output as { quote: { id: string; totalAmount: number } }).quote.id;

    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(quote.status).toBe(QuoteStatus.DRAFT);
    expect(quote.totalAmount).toBeGreaterThan(0);

    const sendRun = await runAction(installation.id, { action: "send_quote", quoteId });
    expect(sendRun.status).toBe("SUCCEEDED");

    const sentQuote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(sentQuote.status).toBe(QuoteStatus.SENT);
    const versions = await prisma.quoteVersion.findMany({ where: { quoteId } });
    expect(versions).toHaveLength(1);
  });

  it("recommande une approche tarifaire sans fixer de montant", async () => {
    const { installation, organization } = await setup("recommend");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client à conseiller" } });

    const run = await runAction(installation.id, { action: "recommend_pricing", leadId: lead.id });
    expect(run.status).toBe("SUCCEEDED");
    expect((run.output as { narrative: string }).narrative.length).toBeGreaterThan(0);
  });
});
