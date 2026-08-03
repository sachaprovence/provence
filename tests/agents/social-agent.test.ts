import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { ensureBusinessAgentPromptSeeds } from "@/lib/agents/business-agents-prompt-seeds";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { SOCIAL_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/social-agent";
import { createBusinessAgentTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";
import { VirtualTourStatus } from "@/generated/prisma/enums";

/**
 * Agent Réseaux sociaux (v0.9) — vérifie qu'il rédige un texte pour une
 * VRAIE `VirtualTour` publiée ; la publication réelle reste un stub
 * honnête (aucune API sociale connectée, voir ADR 0038).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const TOOL_KEYS = ["social.list_recent_published_tours", "social.draft_post"];

runIfDatabase("Agent Réseaux sociaux", () => {
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
      runtimeKey: SOCIAL_AGENT_RUNTIME_KEY,
      category: "social",
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

  it("liste les vraies visites 3D publiées, jamais celles encore en brouillon", async () => {
    const { installation, organization } = await setup("list-published");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client publié" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, leadId: lead.id } });
    const mission = await prisma.mission.create({ data: { organizationId: organization.id, customerId: customer.id, title: "M1" } });
    const published = await prisma.virtualTour.create({
      data: { organizationId: organization.id, leadId: lead.id, missionId: mission.id, status: VirtualTourStatus.PUBLISHED },
    });
    const draft = await prisma.virtualTour.create({
      data: { organizationId: organization.id, leadId: lead.id, missionId: mission.id, status: VirtualTourStatus.DRAFT },
    });

    const run = await runAction(installation.id, { action: "list_recent_published_tours" });
    expect(run.status).toBe("SUCCEEDED");
    const ids = (run.output as { tours: { id: string }[] }).tours.map((t) => t.id);
    expect(ids).toContain(published.id);
    expect(ids).not.toContain(draft.id);
  });

  it("rédige une publication réelle pour une visite publiée existante", async () => {
    const { installation, organization } = await setup("draft-post");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Hôtel Exemple", category: "HOTEL" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, leadId: lead.id } });
    const mission = await prisma.mission.create({ data: { organizationId: organization.id, customerId: customer.id, title: "M1" } });
    const tour = await prisma.virtualTour.create({
      data: { organizationId: organization.id, leadId: lead.id, missionId: mission.id, status: VirtualTourStatus.PUBLISHED, tourUrl: "https://tours.example.test/1" },
    });

    const run = await runAction(installation.id, { action: "draft_post", virtualTourId: tour.id });
    expect(run.status).toBe("SUCCEEDED");
    expect((run.output as { narrative: string }).narrative.length).toBeGreaterThan(0);

    const auditLogs = await prisma.auditLog.findMany({ where: { entityType: "VirtualTour", entityId: tour.id, action: "social_post.drafted" } });
    expect(auditLogs).toHaveLength(1);
  });
});
