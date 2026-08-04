import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createCompany } from "@/lib/crm/company-service";
import {
  createContact,
  getContact,
  updateContact,
  deleteContact,
  listContacts,
  listContactsForLead,
  linkContactToLead,
  unlinkContactFromLead,
  listContactsForCompany,
  linkContactToCompany,
  unlinkContactFromCompany,
} from "@/lib/crm/contact-service";
import { NotFoundError } from "@/lib/errors";

/**
 * `Contact` (v1.1, AR-0160) — personne physique indépendante d'un `Lead`,
 * additive par rapport à `LeadContact` (inchangé, voir docs/adr/0043).
 * Couvre le CRUD, le partage d'une même personne entre plusieurs fiches,
 * et l'isolation multi-tenant.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("CRM v1.1 — Contact", () => {
  const organizationIds: string[] = [];

  async function createOrgWithLead(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org Contact ${suffix}` } });
    organizationIds.push(organization.id);
    const lead = await prisma.lead.create({
      data: { organizationId: organization.id, establishmentName: `Établissement ${suffix}` },
    });
    return { organization, lead };
  }

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  it("crée, lit, met à jour et supprime un Contact", async () => {
    const { organization } = await createOrgWithLead("crud");

    const created = await createContact(organization.id, { fullName: "Jean Dupont", email: "jean@example.test" });
    expect(created.fullName).toBe("Jean Dupont");

    const fetched = await getContact(organization.id, created.id);
    expect(fetched.id).toBe(created.id);

    const updated = await updateContact(organization.id, created.id, { jobTitle: "Directeur" });
    expect(updated.jobTitle).toBe("Directeur");

    const listed = await listContacts(organization.id);
    expect(listed.map((c) => c.id)).toContain(created.id);

    await deleteContact(organization.id, created.id);
    await expect(getContact(organization.id, created.id)).rejects.toThrow(NotFoundError);
  });

  it("une organisation ne peut ni lire ni modifier le Contact d'une autre organisation", async () => {
    const { organization: orgA } = await createOrgWithLead("isolation-a");
    const { organization: orgB } = await createOrgWithLead("isolation-b");

    const contactA = await createContact(orgA.id, { fullName: "Contact A" });

    await expect(getContact(orgB.id, contactA.id)).rejects.toThrow(NotFoundError);
    await expect(updateContact(orgB.id, contactA.id, { fullName: "Piraté" })).rejects.toThrow(NotFoundError);
    await expect(deleteContact(orgB.id, contactA.id)).rejects.toThrow(NotFoundError);
  });

  it("un même Contact reste visible sur les deux Lead auxquels il est lié", async () => {
    const { organization, lead: leadA } = await createOrgWithLead("shared-a");
    const leadB = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Établissement B" } });

    const contact = await createContact(organization.id, { fullName: "Gérant Partagé" });
    await linkContactToLead(organization.id, contact.id, leadA.id, {});
    await linkContactToLead(organization.id, contact.id, leadB.id, { role: "décideur" });

    const linksA = await listContactsForLead(organization.id, leadA.id);
    const linksB = await listContactsForLead(organization.id, leadB.id);
    expect(linksA.map((l) => l.contact.id)).toContain(contact.id);
    expect(linksB.map((l) => l.contact.id)).toContain(contact.id);
    expect(linksB.find((l) => l.contact.id === contact.id)?.role).toBe("décideur");

    await unlinkContactFromLead(organization.id, contact.id, leadA.id);
    const linksAfterUnlink = await listContactsForLead(organization.id, leadA.id);
    expect(linksAfterUnlink.map((l) => l.contact.id)).not.toContain(contact.id);
    const linksBUnchanged = await listContactsForLead(organization.id, leadB.id);
    expect(linksBUnchanged.map((l) => l.contact.id)).toContain(contact.id);
  });

  it("rejette la liaison d'un Contact ou d'un Lead d'une autre organisation", async () => {
    const { organization: orgA } = await createOrgWithLead("cross-org-a");
    const { organization: orgB, lead: leadB } = await createOrgWithLead("cross-org-b");
    const contactA = await createContact(orgA.id, { fullName: "Contact A" });

    await expect(linkContactToLead(orgB.id, contactA.id, leadB.id, {})).rejects.toThrow(NotFoundError);
    await expect(linkContactToLead(orgA.id, contactA.id, leadB.id, {})).rejects.toThrow(NotFoundError);
  });

  it("lie un Contact à une Company et le délie", async () => {
    const { organization } = await createOrgWithLead("company-link");
    const company = await createCompany(organization.id, { name: "Groupe Test" });
    const contact = await createContact(organization.id, { fullName: "Prescripteur" });

    await linkContactToCompany(organization.id, contact.id, company.id, { role: "prescripteur" });
    const links = await listContactsForCompany(organization.id, company.id);
    expect(links.map((l) => l.contact.id)).toContain(contact.id);

    await unlinkContactFromCompany(organization.id, contact.id, company.id);
    const remaining = await listContactsForCompany(organization.id, company.id);
    expect(remaining.map((l) => l.contact.id)).not.toContain(contact.id);
  });

  it("la suppression du Contact entraîne la suppression en cascade de ses liaisons", async () => {
    const { organization, lead } = await createOrgWithLead("cascade");
    const contact = await createContact(organization.id, { fullName: "À supprimer" });
    await linkContactToLead(organization.id, contact.id, lead.id, {});

    await deleteContact(organization.id, contact.id);

    const remainingLinks = await prisma.leadContactRelation.findMany({ where: { contactId: contact.id } });
    expect(remainingLinks).toHaveLength(0);
  });
});
