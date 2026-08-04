import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";
import { expectNoCrossTenantLeak } from "../helpers/tenant-isolation";

/**
 * Isolation multi-tenant — Devis (v0.10, AR-0055). Domaine financier non
 * couvert jusqu'ici — `Quote` n'a pas de couche service dédiée (contrairement
 * à `Invoice`) : `GET /api/quotes` (src/app/api/quotes/route.ts) et
 * `PATCH /api/quotes/[id]` (src/app/api/quotes/[id]/route.ts) filtrent tous
 * deux directement par `{ id, organizationId: actor.organization.id }` —
 * ce test reproduit exactement cette même requête, plutôt que d'introduire
 * une abstraction qui n'existe pas dans le code réel.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("isolation multi-tenant — Quote", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  async function createOrgWithQuote(suffix: string) {
    const fixture = await createWorkflowTestFixture(suffix);
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const lead = await prisma.lead.create({ data: { organizationId: fixture.organization.id, establishmentName: `Client ${suffix}` } });
    const quote = await prisma.quote.create({
      data: { organizationId: fixture.organization.id, leadId: lead.id, reference: `DE-TEST-${suffix}`, totalAmount: 5000 },
    });

    return { ...fixture, quote };
  }

  it("la liste des devis scopée par organisation ne renvoie jamais celui d'une autre organisation", async () => {
    const fixtureA = await createOrgWithQuote("quote-isolation-a");
    const fixtureB = await createOrgWithQuote("quote-isolation-b");

    await expectNoCrossTenantLeak({
      actorAItems: () => prisma.quote.findMany({ where: { organizationId: fixtureA.organization.id } }),
      actorBItems: () => prisma.quote.findMany({ where: { organizationId: fixtureB.organization.id } }),
      actorAOwnResourceId: fixtureA.quote.id,
      actorBOwnResourceId: fixtureB.quote.id,
      getId: (quote) => quote.id,
    });
  });

  it("la résolution par id+organisation (utilisée par PATCH /api/quotes/[id]) ne trouve jamais le devis d'une autre organisation", async () => {
    const fixtureA = await createOrgWithQuote("quote-isolation-spoof-a");
    const fixtureB = await createOrgWithQuote("quote-isolation-spoof-b");

    const foundByA = await prisma.quote.findFirst({ where: { id: fixtureB.quote.id, organizationId: fixtureA.organization.id } });
    const foundByB = await prisma.quote.findFirst({ where: { id: fixtureA.quote.id, organizationId: fixtureB.organization.id } });

    expect(foundByA).toBeNull();
    expect(foundByB).toBeNull();
  });
});
