import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { ensureBusinessAgentPromptSeeds } from "@/lib/agents/business-agents-prompt-seeds";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { PLANNING_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/planning-agent";
import { createBusinessAgentTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";
import { getBusinessHoursConfig, updateBusinessHours, isWithinBusinessHours } from "@/lib/settings/business-hours-service";
import { ValidationError } from "@/lib/errors";

/**
 * Paramètres d'agenda (v1.1, AR-0179) — horaires d'ouverture par jour et
 * capacité par créneau, consommés par `planning.suggest_slots`. Absence de
 * configuration = comportement inchangé (aucune restriction, capacité 1).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Paramètres d'agenda — business-hours-service", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  async function createOrg(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org agenda ${suffix}` } });
    organizationIds.push(organization.id);
    return organization;
  }

  it("sans configuration, renvoie 7 jours ouverts sans restriction et une capacité de 1", async () => {
    const organization = await createOrg("default");
    const config = await getBusinessHoursConfig(organization.id);
    expect(config.appointmentSlotCapacity).toBe(1);
    expect(config.hours).toHaveLength(7);
    expect(config.hours.every((d) => d.isOpen && d.opensAt === null && d.closesAt === null)).toBe(true);
  });

  it("updateBusinessHours persiste la capacité et les horaires, idempotent (aucune ligne dupliquée)", async () => {
    const organization = await createOrg("update");
    const hours = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      isOpen: dayOfWeek !== 0 && dayOfWeek !== 6,
      opensAt: dayOfWeek !== 0 && dayOfWeek !== 6 ? "09:00" : null,
      closesAt: dayOfWeek !== 0 && dayOfWeek !== 6 ? "18:00" : null,
    }));

    await updateBusinessHours(organization.id, { appointmentSlotCapacity: 3, hours });
    const config = await updateBusinessHours(organization.id, { appointmentSlotCapacity: 3, hours });

    expect(config.appointmentSlotCapacity).toBe(3);
    const monday = config.hours.find((d) => d.dayOfWeek === 1);
    expect(monday).toEqual({ dayOfWeek: 1, isOpen: true, opensAt: "09:00", closesAt: "18:00" });
    const sunday = config.hours.find((d) => d.dayOfWeek === 0);
    expect(sunday).toEqual({ dayOfWeek: 0, isOpen: false, opensAt: null, closesAt: null });

    const rowCount = await prisma.businessHours.count({ where: { organizationId: organization.id } });
    expect(rowCount).toBe(7);
  });

  it("rejette un opensAt postérieur ou égal à closesAt", async () => {
    const organization = await createOrg("invalid-hours");
    const hours = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      isOpen: false,
      opensAt: null as string | null,
      closesAt: null as string | null,
    }));
    hours[1] = { dayOfWeek: 1, isOpen: true, opensAt: "18:00", closesAt: "09:00" };

    await expect(updateBusinessHours(organization.id, { hours })).rejects.toThrow(ValidationError);
  });

  it("isWithinBusinessHours : un jour fermé rejette tout créneau, un jour ouvert sans horaires accepte tout", () => {
    const hours = [
      { dayOfWeek: 0, isOpen: false, opensAt: null, closesAt: null },
      { dayOfWeek: 1, isOpen: true, opensAt: null, closesAt: null },
      { dayOfWeek: 2, isOpen: true, opensAt: "09:00", closesAt: "18:00" },
      { dayOfWeek: 3, isOpen: true, opensAt: null, closesAt: null },
      { dayOfWeek: 4, isOpen: true, opensAt: null, closesAt: null },
      { dayOfWeek: 5, isOpen: true, opensAt: null, closesAt: null },
      { dayOfWeek: 6, isOpen: true, opensAt: null, closesAt: null },
    ];

    // Dimanche 2026-06-07 est fermé.
    expect(isWithinBusinessHours(hours, new Date("2026-06-07T10:00:00Z"), new Date("2026-06-07T11:00:00Z"))).toBe(false);
    // Lundi 2026-06-08, ouvert sans restriction.
    expect(isWithinBusinessHours(hours, new Date("2026-06-08T23:00:00Z"), new Date("2026-06-08T23:30:00Z"))).toBe(true);
    // Mardi 2026-06-09, ouvert 09:00-18:00 : un créneau 08:00-09:00 déborde avant l'ouverture.
    expect(isWithinBusinessHours(hours, new Date("2026-06-09T08:00:00Z"), new Date("2026-06-09T09:00:00Z"))).toBe(false);
    // Mardi, créneau 09:00-10:00 est dans les horaires.
    expect(isWithinBusinessHours(hours, new Date("2026-06-09T09:00:00Z"), new Date("2026-06-09T10:00:00Z"))).toBe(true);
    // Mardi, créneau 17:30-18:30 déborde après la fermeture.
    expect(isWithinBusinessHours(hours, new Date("2026-06-09T17:30:00Z"), new Date("2026-06-09T18:30:00Z"))).toBe(false);
  });
});

runIfDatabase("planning.suggest_slots respecte la capacité et les horaires configurés (AR-0179)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const definitionIds: string[] = [];
  const TOOL_KEYS = ["planning.check_availability", "planning.book_appointment", "planning.suggest_slots"];

  afterAll(async () => {
    await cleanupAgentTestFixtures(organizationIds, userIds, definitionIds);
  });

  async function setup(suffix: string) {
    registerBuiltInAgentComponents();
    await ensureBusinessAgentPromptSeeds();
    const fixture = await createBusinessAgentTestFixture(suffix, {
      runtimeKey: PLANNING_AGENT_RUNTIME_KEY,
      category: "planning",
      declaredToolKeys: TOOL_KEYS,
      declaredPermissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
    });
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    definitionIds.push(fixture.definition.id, fixture.businessDefinition.id);

    const installation = await installAgent(fixture.actor, { definitionId: fixture.businessDefinition.id, toolKeys: TOOL_KEYS, permissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"] });
    await transitionInstallation(fixture.actor, installation.id, "activate");
    return { ...fixture, installation };
  }

  async function runAction(installationId: string, input: unknown) {
    const run = await createAgentRun({ installationId, input, maxAttempts: 1 });
    await executeAgentRun(run.id);
    return prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
  }

  it("avec une capacité de 3, deux créneaux occupés qui se chevauchent laissent le créneau disponible", async () => {
    const { installation, organization } = await setup("capacity-under");
    await updateBusinessHours(organization.id, {
      appointmentSlotCapacity: 3,
      hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, isOpen: true, opensAt: null, closesAt: null })),
    });

    const fromIso = new Date("2026-06-01T08:00:00Z").toISOString();
    const toIso = new Date("2026-06-01T11:00:00Z").toISOString();
    // Deux réservations qui se chevauchent sur 09:00-10:00 — sous la capacité de 3, le créneau reste proposé.
    const busy = [
      { start: "2026-06-01T09:00:00Z", end: "2026-06-01T10:00:00Z" },
      { start: "2026-06-01T09:00:00Z", end: "2026-06-01T10:00:00Z" },
    ];

    const run = await runAction(installation.id, { action: "suggest_slots", fromIso, toIso, durationMinutes: 60, busy });
    expect(run.status).toBe("SUCCEEDED");
    const slots = (run.output as { slots: { start: string; end: string }[] }).slots;
    expect(slots).toEqual([
      { start: "2026-06-01T08:00:00.000Z", end: "2026-06-01T09:00:00.000Z" },
      { start: "2026-06-01T09:00:00.000Z", end: "2026-06-01T10:00:00.000Z" },
      { start: "2026-06-01T10:00:00.000Z", end: "2026-06-01T11:00:00.000Z" },
    ]);
  });

  it("avec une capacité de 2, atteindre exactement la capacité (2 chevauchements) rend le créneau plein", async () => {
    const { installation, organization } = await setup("capacity-full");
    await updateBusinessHours(organization.id, {
      appointmentSlotCapacity: 2,
      hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, isOpen: true, opensAt: null, closesAt: null })),
    });

    const fromIso = new Date("2026-06-01T08:00:00Z").toISOString();
    const toIso = new Date("2026-06-01T11:00:00Z").toISOString();
    const busy = [
      { start: "2026-06-01T09:00:00Z", end: "2026-06-01T10:00:00Z" },
      { start: "2026-06-01T09:00:00Z", end: "2026-06-01T10:00:00Z" },
      { start: "2026-06-01T09:00:00Z", end: "2026-06-01T10:00:00Z" },
    ];

    const run = await runAction(installation.id, { action: "suggest_slots", fromIso, toIso, durationMinutes: 60, busy });
    expect(run.status).toBe("SUCCEEDED");
    const slots = (run.output as { slots: { start: string; end: string }[] }).slots;
    expect(slots).toEqual([
      { start: "2026-06-01T08:00:00.000Z", end: "2026-06-01T09:00:00.000Z" },
      { start: "2026-06-01T10:00:00.000Z", end: "2026-06-01T11:00:00.000Z" },
    ]);
  });

  it("un créneau hors des horaires d'ouverture configurés n'est jamais proposé", async () => {
    const { installation, organization } = await setup("business-hours-filter");
    // Lundi 2026-06-01 : ouvert seulement 09:00-11:00.
    await updateBusinessHours(organization.id, {
      hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        isOpen: dayOfWeek === 1,
        opensAt: dayOfWeek === 1 ? "09:00" : null,
        closesAt: dayOfWeek === 1 ? "11:00" : null,
      })),
    });

    const fromIso = new Date("2026-06-01T08:00:00Z").toISOString();
    const toIso = new Date("2026-06-01T12:00:00Z").toISOString();

    const run = await runAction(installation.id, { action: "suggest_slots", fromIso, toIso, durationMinutes: 60, busy: [] });
    expect(run.status).toBe("SUCCEEDED");
    const slots = (run.output as { slots: { start: string; end: string }[] }).slots;
    // Seuls 09:00-10:00 et 10:00-11:00 sont dans les horaires — 08:00-09:00 et 11:00-12:00 sont exclus.
    expect(slots).toEqual([
      { start: "2026-06-01T09:00:00.000Z", end: "2026-06-01T10:00:00.000Z" },
      { start: "2026-06-01T10:00:00.000Z", end: "2026-06-01T11:00:00.000Z" },
    ]);
  });
});
