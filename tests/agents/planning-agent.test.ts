import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { ensureBusinessAgentPromptSeeds } from "@/lib/agents/business-agents-prompt-seeds";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { PLANNING_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/planning-agent";
import { createBusinessAgentTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";

/**
 * Agent Planning (v0.9) — vérifie qu'il crée de VRAIS `Appointment` et
 * retombe honnêtement sur eux pour les disponibilités quand Google
 * Calendar n'est pas connecté (voir ADR 0038 §agents métier).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const TOOL_KEYS = ["planning.check_availability", "planning.book_appointment", "planning.suggest_slots"];

runIfDatabase("Agent Planning", () => {
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
      runtimeKey: PLANNING_AGENT_RUNTIME_KEY,
      category: "planning",
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

  it("réserve un vrai rendez-vous", async () => {
    const { installation, organization } = await setup("book");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client RDV" } });

    const run = await runAction(installation.id, {
      action: "book_appointment",
      leadId: lead.id,
      title: "Visite terrain",
      startAt: new Date(Date.now() + 86400000).toISOString(),
      endAt: new Date(Date.now() + 90000000).toISOString(),
    });
    expect(run.status).toBe("SUCCEEDED");

    const appointmentId = (run.output as { appointment: { id: string } }).appointment.id;
    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.leadId).toBe(lead.id);
  });

  it("sans Google Calendar connecté, retombe honnêtement sur les vrais rendez-vous déjà enregistrés", async () => {
    const { installation, organization } = await setup("availability-fallback");
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Client" } });
    const start = new Date(Date.now() + 3600_000);
    const end = new Date(Date.now() + 7200_000);
    await prisma.appointment.create({
      data: { organizationId: organization.id, leadId: lead.id, title: "Occupé", startAt: start, endAt: end },
    });

    const run = await runAction(installation.id, {
      action: "check_availability",
      fromIso: new Date().toISOString(),
      toIso: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(run.status).toBe("SUCCEEDED");
    const output = run.output as { busy: { start: string; end: string }[]; source: string };
    expect(output.source).toBe("appointments");
    expect(output.busy).toHaveLength(1);
  });

  it("calcule des créneaux libres déterministes à partir des créneaux occupés", async () => {
    const { installation } = await setup("suggest-slots");
    const fromIso = new Date("2026-06-01T08:00:00Z").toISOString();
    const toIso = new Date("2026-06-01T12:00:00Z").toISOString();
    const busy = [{ start: "2026-06-01T09:00:00Z", end: "2026-06-01T10:00:00Z" }];

    const run = await runAction(installation.id, { action: "suggest_slots", fromIso, toIso, durationMinutes: 60, busy });
    expect(run.status).toBe("SUCCEEDED");
    const slots = (run.output as { slots: { start: string; end: string }[] }).slots;
    expect(slots).toEqual([
      { start: "2026-06-01T08:00:00.000Z", end: "2026-06-01T09:00:00.000Z" },
      { start: "2026-06-01T10:00:00.000Z", end: "2026-06-01T11:00:00.000Z" },
      { start: "2026-06-01T11:00:00.000Z", end: "2026-06-01T12:00:00.000Z" },
    ]);
  });
});
