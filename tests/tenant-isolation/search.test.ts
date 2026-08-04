import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { globalSearch } from "@/lib/search/global-search-service";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

/**
 * Recherche globale (v1.1, AR-0181) — isolation multi-tenant sur CHAQUE
 * type de résultat (prospects, entreprises, contacts, devis, factures,
 * visites 3D). Deux organisations créent des enregistrements partageant le
 * même terme de recherche ("Isolation") : chacune ne doit jamais voir
 * l'enregistrement de l'autre.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Recherche globale — isolation multi-tenant", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  async function createOrgWithData(suffix: string) {
    const fixture = await createWorkflowTestFixture(`search-${suffix}`);
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const lead = await prisma.lead.create({
      data: { organizationId: fixture.organization.id, establishmentName: `Isolation Hôtel ${suffix}` },
    });
    const company = await prisma.company.create({
      data: { organizationId: fixture.organization.id, name: `Isolation Corp ${suffix}` },
    });
    const contact = await prisma.contact.create({
      data: { organizationId: fixture.organization.id, fullName: `Isolation Contact ${suffix}` },
    });
    await prisma.leadContactRelation.create({ data: { leadId: lead.id, contactId: contact.id } });
    const quote = await prisma.quote.create({
      data: { organizationId: fixture.organization.id, leadId: lead.id, reference: `ISOLATION-DEV-${suffix}`, totalAmount: 5000 },
    });
    const invoice = await prisma.invoice.create({
      data: { organizationId: fixture.organization.id, leadId: lead.id, reference: `ISOLATION-FA-${suffix}`, totalAmount: 5000 },
    });
    const customer = await prisma.customer.create({ data: { organizationId: fixture.organization.id, leadId: lead.id } });
    const mission = await prisma.mission.create({ data: { organizationId: fixture.organization.id, customerId: customer.id, title: "M1" } });
    const tour = await prisma.virtualTour.create({ data: { organizationId: fixture.organization.id, leadId: lead.id, missionId: mission.id } });

    return { ...fixture, lead, company, contact, quote, invoice, tour };
  }

  it("un terme de recherche partagé entre deux organisations ne renvoie jamais les résultats de l'autre, pour aucun type", async () => {
    const orgA = await createOrgWithData("a");
    const orgB = await createOrgWithData("b");

    const [resultsA, resultsB] = await Promise.all([
      globalSearch(orgA.organization.id, "Isolation"),
      globalSearch(orgB.organization.id, "Isolation"),
    ]);

    expect(resultsA.leads.map((r) => r.id)).toContain(orgA.lead.id);
    expect(resultsA.leads.map((r) => r.id)).not.toContain(orgB.lead.id);
    expect(resultsB.leads.map((r) => r.id)).toContain(orgB.lead.id);
    expect(resultsB.leads.map((r) => r.id)).not.toContain(orgA.lead.id);

    expect(resultsA.companies.map((r) => r.id)).toContain(orgA.company.id);
    expect(resultsA.companies.map((r) => r.id)).not.toContain(orgB.company.id);

    expect(resultsA.contacts.map((r) => r.id)).toContain(orgA.contact.id);
    expect(resultsA.contacts.map((r) => r.id)).not.toContain(orgB.contact.id);
    // Le contact est relié à un lead : le lien doit résoudre vers la fiche du bon lead.
    expect(resultsA.contacts.find((r) => r.id === orgA.contact.id)?.href).toBe(`/leads/${orgA.lead.id}`);

    expect(resultsA.quotes.map((r) => r.id)).toContain(orgA.quote.id);
    expect(resultsA.quotes.map((r) => r.id)).not.toContain(orgB.quote.id);

    expect(resultsA.invoices.map((r) => r.id)).toContain(orgA.invoice.id);
    expect(resultsA.invoices.map((r) => r.id)).not.toContain(orgB.invoice.id);

    expect(resultsA.virtualTours.map((r) => r.id)).toContain(orgA.tour.id);
    expect(resultsA.virtualTours.map((r) => r.id)).not.toContain(orgB.tour.id);
  });

  it("une requête de moins de 2 caractères renvoie toujours des résultats vides (jamais un balayage complet de la table)", async () => {
    const org = await createOrgWithData("short-query");
    const results = await globalSearch(org.organization.id, "a");
    expect(results.leads).toEqual([]);
    expect(results.companies).toEqual([]);
    expect(results.contacts).toEqual([]);
    expect(results.quotes).toEqual([]);
    expect(results.invoices).toEqual([]);
    expect(results.virtualTours).toEqual([]);
  });

  it("la recherche est insensible à la casse", async () => {
    const org = await createOrgWithData("case-insensitive");
    const results = await globalSearch(org.organization.id, "isolation hôtel");
    expect(results.leads.map((r) => r.id)).toContain(org.lead.id);
  });
});
