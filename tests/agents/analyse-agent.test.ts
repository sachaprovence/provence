import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { ensureBusinessAgentPromptSeeds } from "@/lib/agents/business-agents-prompt-seeds";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { ANALYSE_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/analyse-agent";
import { createBusinessAgentTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";
import { LeadStage } from "@/generated/prisma/enums";

/**
 * Agent Analyse (v0.9) — promeut le stub `future-analyse-agent` (v0.4) en
 * agent réel. Vérifie qu'il réutilise les VRAIES statistiques déjà
 * calculées (`@/lib/stats`, alimentent `/dashboard`), jamais un recalcul
 * séparé (voir ADR 0038 §agents métier).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const TOOL_KEYS = ["analyse.generate_report", "analyse.detect_stalled_leads"];

runIfDatabase("Agent Analyse", () => {
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
      runtimeKey: ANALYSE_AGENT_RUNTIME_KEY,
      category: "analyse",
      declaredToolKeys: TOOL_KEYS,
      declaredPermissions: ["VIEW_WORKSPACE"],
    });
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    definitionIds.push(fixture.definition.id, fixture.businessDefinition.id);

    const installation = await installAgent(fixture.actor, {
      definitionId: fixture.businessDefinition.id,
      toolKeys: TOOL_KEYS,
      permissions: ["VIEW_WORKSPACE"],
    });
    await transitionInstallation(fixture.actor, installation.id, "activate");
    return { ...fixture, installation };
  }

  async function runAction(installationId: string, input: unknown) {
    const run = await createAgentRun({ installationId, input, maxAttempts: 1 });
    await executeAgentRun(run.id);
    return prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
  }

  it("génère un rapport basé sur les vraies statistiques de l'organisation", async () => {
    const { installation, organization } = await setup("report");
    await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Nouveau prospect" } });

    const run = await runAction(installation.id, { action: "generate_report" });
    expect(run.status).toBe("SUCCEEDED");
    const output = run.output as { stats: { kpis: { newLeads: number } }; narrative: string };
    expect(output.stats.kpis.newLeads).toBeGreaterThanOrEqual(1);
    expect(output.narrative.length).toBeGreaterThan(0);
  });

  it("détecte les vrais prospects bloqués dans le pipeline depuis longtemps", async () => {
    const { installation, organization } = await setup("stalled");
    const stalledLead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Bloqué", stage: LeadStage.QUALIFIED } });
    await prisma.lead.update({ where: { id: stalledLead.id }, data: { updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } });
    const freshLead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Récent", stage: LeadStage.QUALIFIED } });

    const run = await runAction(installation.id, { action: "detect_stalled_leads", staleAfterDays: 14 });
    expect(run.status).toBe("SUCCEEDED");
    const ids = (run.output as { leads: { id: string }[] }).leads.map((l) => l.id);
    expect(ids).toContain(stalledLead.id);
    expect(ids).not.toContain(freshLead.id);
  });
});
