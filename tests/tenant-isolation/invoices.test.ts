import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { listInvoices, getInvoice } from "@/lib/crm/invoice-service";
import { NotFoundError } from "@/lib/errors";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";
import { expectNoCrossTenantLeak } from "../helpers/tenant-isolation";

/**
 * Isolation multi-tenant — Facturation (v0.10, AR-0055). Domaine financier
 * non couvert jusqu'ici par `tests/tenant-isolation/` — vérifie que
 * `listInvoices`/`getInvoice` (src/lib/crm/invoice-service.ts), utilisées
 * telles quelles par les routes `GET /api/invoices` et
 * `GET /api/invoices/[id]`, ne laissent jamais fuiter une facture d'une
 * autre organisation.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("isolation multi-tenant — Invoice", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  async function createOrgWithInvoice(suffix: string) {
    const fixture = await createWorkflowTestFixture(suffix);
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const lead = await prisma.lead.create({ data: { organizationId: fixture.organization.id, establishmentName: `Client ${suffix}` } });
    const invoice = await prisma.invoice.create({
      data: { organizationId: fixture.organization.id, leadId: lead.id, reference: `FA-TEST-${suffix}`, totalAmount: 10000, vatAmount: 2000 },
    });

    return { ...fixture, invoice };
  }

  it("listInvoices ne renvoie jamais la facture d'une autre organisation", async () => {
    const fixtureA = await createOrgWithInvoice("invoice-isolation-a");
    const fixtureB = await createOrgWithInvoice("invoice-isolation-b");

    await expectNoCrossTenantLeak({
      actorAItems: () => listInvoices(fixtureA.organization.id),
      actorBItems: () => listInvoices(fixtureB.organization.id),
      actorAOwnResourceId: fixtureA.invoice.id,
      actorBOwnResourceId: fixtureB.invoice.id,
      getId: (invoice) => invoice.id,
    });
  });

  it("getInvoice échoue explicitement (NotFoundError) pour une facture d'une autre organisation, sans fuite d'existence", async () => {
    const fixtureA = await createOrgWithInvoice("invoice-isolation-spoof-a");
    const fixtureB = await createOrgWithInvoice("invoice-isolation-spoof-b");

    await expect(getInvoice(fixtureA.organization.id, fixtureB.invoice.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getInvoice(fixtureB.organization.id, fixtureA.invoice.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
