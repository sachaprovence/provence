import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { ensureBusinessAgentPromptSeeds } from "@/lib/agents/business-agents-prompt-seeds";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { VISITES_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/visites-agent";
import { createBusinessAgentTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";
import { VirtualTourStatus } from "@/generated/prisma/enums";

/**
 * Agent Visites (v1.1, AR-0174) — surveille le cycle de vie des VRAIES
 * `VirtualTour` (voir ADR 0038 §agents métier) : détecte les visites
 * bloquées trop longtemps à un statut, complémentaire de l'Agent Réseaux
 * sociaux (qui n'agit qu'APRÈS publication).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const TOOL_KEYS = ["visites.detect_stalled_tours", "visites.request_technician_followup", "visites.advance_status"];

runIfDatabase("Agent Visites", () => {
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

  async function setup(suffix: string, permissions: string[] = ["EXECUTE_MISSIONS", "VIEW_WORKSPACE"]) {
    const fixture = await createBusinessAgentTestFixture(suffix, {
      runtimeKey: VISITES_AGENT_RUNTIME_KEY,
      category: "visites",
      declaredToolKeys: TOOL_KEYS,
      declaredPermissions: permissions,
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

  async function createTour(organizationId: string, leadId: string, missionId: string, status: VirtualTourStatus, extra: Record<string, unknown> = {}) {
    return prisma.virtualTour.create({
      data: { organizationId, leadId, missionId, status, ...extra },
    });
  }

  it("détecte une visite SCHEDULED dont la date de prise de vue est dépassée depuis plus de 24h, mais pas une visite à venir", async () => {
    const { installation, organization } = await setup("scheduled-overdue");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client SCHEDULED" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, leadId: lead.id } });
    const mission = await prisma.mission.create({ data: { organizationId: organization.id, customerId: customer.id, title: "M1" } });

    const overdue = await createTour(organization.id, lead.id, mission.id, VirtualTourStatus.SCHEDULED, {
      scheduledAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });
    const upcoming = await createTour(organization.id, lead.id, mission.id, VirtualTourStatus.SCHEDULED, {
      scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    const run = await runAction(installation.id, { action: "detect_stalled_tours" });
    expect(run.status).toBe("SUCCEEDED");
    const ids = (run.output as { tours: { id: string }[] }).tours.map((t) => t.id);
    expect(ids).toContain(overdue.id);
    expect(ids).not.toContain(upcoming.id);
  });

  it("détecte une visite SHOOTING_DONE non traitée depuis plus de 48h, mais pas une visite récemment tournée", async () => {
    const { installation, organization } = await setup("shooting-done-stalled");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client SHOOTING_DONE" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, leadId: lead.id } });
    const mission = await prisma.mission.create({ data: { organizationId: organization.id, customerId: customer.id, title: "M1" } });

    const stalled = await createTour(organization.id, lead.id, mission.id, VirtualTourStatus.SHOOTING_DONE);
    await prisma.virtualTour.update({ where: { id: stalled.id }, data: { updatedAt: new Date(Date.now() - 72 * 60 * 60 * 1000) } });
    const recent = await createTour(organization.id, lead.id, mission.id, VirtualTourStatus.SHOOTING_DONE);

    const run = await runAction(installation.id, { action: "detect_stalled_tours" });
    expect(run.status).toBe("SUCCEEDED");
    const ids = (run.output as { tours: { id: string }[] }).tours.map((t) => t.id);
    expect(ids).toContain(stalled.id);
    expect(ids).not.toContain(recent.id);
  });

  it("ne détecte jamais une visite PUBLISHED ou DRAFT (statuts hors surveillance)", async () => {
    const { installation, organization } = await setup("out-of-scope-statuses");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client hors périmètre" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, leadId: lead.id } });
    const mission = await prisma.mission.create({ data: { organizationId: organization.id, customerId: customer.id, title: "M1" } });

    const published = await createTour(organization.id, lead.id, mission.id, VirtualTourStatus.PUBLISHED);
    await prisma.virtualTour.update({ where: { id: published.id }, data: { updatedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } });
    const draft = await createTour(organization.id, lead.id, mission.id, VirtualTourStatus.DRAFT);
    await prisma.virtualTour.update({ where: { id: draft.id }, data: { updatedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } });

    const run = await runAction(installation.id, { action: "detect_stalled_tours" });
    expect(run.status).toBe("SUCCEEDED");
    const ids = (run.output as { tours: { id: string }[] }).tours.map((t) => t.id);
    expect(ids).not.toContain(published.id);
    expect(ids).not.toContain(draft.id);
  });

  it("crée une vraie notification de relance technicien pour une visite bloquée", async () => {
    const { installation, organization } = await setup("technician-followup");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Relance technicien" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, leadId: lead.id } });
    const mission = await prisma.mission.create({ data: { organizationId: organization.id, customerId: customer.id, title: "M1" } });
    const tour = await createTour(organization.id, lead.id, mission.id, VirtualTourStatus.PROCESSING);

    const run = await runAction(installation.id, { action: "request_technician_followup", virtualTourId: tour.id });
    expect(run.status).toBe("SUCCEEDED");
    const notificationId = (run.output as { notificationId: string }).notificationId;

    const notification = await prisma.notification.findUniqueOrThrow({ where: { id: notificationId } });
    expect(notification.organizationId).toBe(organization.id);
    expect(notification.type).toBe("visites_agent.technician_followup");
    expect(notification.link).toBe(`/visits/${tour.id}`);
  });

  it("fait avancer le statut réel d'une visite (mêmes règles que /visits)", async () => {
    const { installation, organization } = await setup("advance-status");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Avancement statut" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, leadId: lead.id } });
    const mission = await prisma.mission.create({ data: { organizationId: organization.id, customerId: customer.id, title: "M1" } });
    const tour = await createTour(organization.id, lead.id, mission.id, VirtualTourStatus.SHOOTING_DONE);

    const run = await runAction(installation.id, { action: "advance_status", virtualTourId: tour.id, status: "PROCESSING" });
    expect(run.status).toBe("SUCCEEDED");

    const after = await prisma.virtualTour.findUniqueOrThrow({ where: { id: tour.id } });
    expect(after.status).toBe(VirtualTourStatus.PROCESSING);
  });

  it("refuse d'agir sans la permission EXECUTE_MISSIONS (relance technicien et changement de statut restent bloqués)", async () => {
    const { installation, organization } = await setup("permissions-denied", ["VIEW_WORKSPACE"]);
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Sans permission" } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, leadId: lead.id } });
    const mission = await prisma.mission.create({ data: { organizationId: organization.id, customerId: customer.id, title: "M1" } });
    const tour = await createTour(organization.id, lead.id, mission.id, VirtualTourStatus.SHOOTING_DONE);

    const run = await runAction(installation.id, { action: "advance_status", virtualTourId: tour.id, status: "PROCESSING" });
    expect(run.status).toBe("FAILED");
    expect(JSON.stringify(run.error)).toContain("EXECUTE_MISSIONS");

    const unchanged = await prisma.virtualTour.findUniqueOrThrow({ where: { id: tour.id } });
    expect(unchanged.status).toBe(VirtualTourStatus.SHOOTING_DONE);
  });
});
