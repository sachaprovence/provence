import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";
import { expectNoCrossTenantLeak } from "../helpers/tenant-isolation";

/**
 * Isolation multi-tenant — Rendez-vous (v0.10, AR-0055). `Appointment` n'a
 * pas de couche service dédiée : `GET /api/appointments`
 * (src/app/api/appointments/route.ts) et `PATCH /api/appointments/[id]`
 * (src/app/api/appointments/[id]/route.ts) filtrent tous deux directement
 * par `{ organizationId: actor.organization.id }` — ce test reproduit
 * exactement cette même requête.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("isolation multi-tenant — Appointment", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  async function createOrgWithAppointment(suffix: string) {
    const fixture = await createWorkflowTestFixture(suffix);
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const lead = await prisma.lead.create({ data: { organizationId: fixture.organization.id, establishmentName: `Client ${suffix}` } });
    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);
    const appointment = await prisma.appointment.create({
      data: { organizationId: fixture.organization.id, leadId: lead.id, title: `RDV ${suffix}`, startAt, endAt },
    });

    return { ...fixture, appointment };
  }

  it("la liste des rendez-vous scopée par organisation ne renvoie jamais celui d'une autre organisation", async () => {
    const fixtureA = await createOrgWithAppointment("appointment-isolation-a");
    const fixtureB = await createOrgWithAppointment("appointment-isolation-b");

    await expectNoCrossTenantLeak({
      actorAItems: () => prisma.appointment.findMany({ where: { organizationId: fixtureA.organization.id } }),
      actorBItems: () => prisma.appointment.findMany({ where: { organizationId: fixtureB.organization.id } }),
      actorAOwnResourceId: fixtureA.appointment.id,
      actorBOwnResourceId: fixtureB.appointment.id,
      getId: (appointment) => appointment.id,
    });
  });

  it("la résolution par id+organisation (utilisée par PATCH /api/appointments/[id]) ne trouve jamais le rendez-vous d'une autre organisation", async () => {
    const fixtureA = await createOrgWithAppointment("appointment-isolation-spoof-a");
    const fixtureB = await createOrgWithAppointment("appointment-isolation-spoof-b");

    const foundByA = await prisma.appointment.findFirst({ where: { id: fixtureB.appointment.id, organizationId: fixtureA.organization.id } });
    const foundByB = await prisma.appointment.findFirst({ where: { id: fixtureA.appointment.id, organizationId: fixtureB.organization.id } });

    expect(foundByA).toBeNull();
    expect(foundByB).toBeNull();
  });
});
