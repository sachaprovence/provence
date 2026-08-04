import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createCompany, getCompany, updateCompany, deleteCompany, listCompanies } from "@/lib/crm/company-service";
import { createProperty, getProperty, updateProperty, deleteProperty, listProperties } from "@/lib/crm/property-service";
import { createAttachment, listAttachments, deleteAttachment } from "@/lib/crm/attachment-service";
import { DemoStorageProvider } from "@/lib/storage/demo-provider";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * `Company`/`Property`/`Attachment` (v0.9, ADR 0038) : entités CRM
 * additives. Couvre le CRUD de base, le scoping par organisation (une
 * organisation ne doit jamais pouvoir référencer/modifier/lire une
 * ressource d'une autre organisation en devinant un id) et les
 * comportements de cascade Prisma (suppression de `Lead` -> `Property`,
 * suppression de `Company` -> `Lead.companyId` remis à `null`).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("CRM v0.9 — Company / Property / Attachment", () => {
  const organizationIds: string[] = [];

  async function createOrgWithLead(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org CRM ${suffix}` } });
    organizationIds.push(organization.id);
    const lead = await prisma.lead.create({
      data: { organizationId: organization.id, establishmentName: `Établissement ${suffix}` },
    });
    return { organization, lead };
  }

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  it("crée, lit, met à jour et supprime une Company", async () => {
    const { organization } = await createOrgWithLead("company-crud");

    const created = await createCompany(organization.id, { name: "Groupe Hôtelier Test" });
    expect(created.name).toBe("Groupe Hôtelier Test");
    expect(created.country).toBe("France");

    const fetched = await getCompany(organization.id, created.id);
    expect(fetched.id).toBe(created.id);

    const updated = await updateCompany(organization.id, created.id, { legalName: "Groupe Hôtelier Test SAS" });
    expect(updated.legalName).toBe("Groupe Hôtelier Test SAS");

    const listed = await listCompanies(organization.id);
    expect(listed.map((c) => c.id)).toContain(created.id);

    await deleteCompany(organization.id, created.id);
    await expect(getCompany(organization.id, created.id)).rejects.toThrow(NotFoundError);
  });

  it("une organisation ne peut ni lire ni modifier la Company d'une autre organisation", async () => {
    const { organization: orgA } = await createOrgWithLead("company-isolation-a");
    const { organization: orgB } = await createOrgWithLead("company-isolation-b");

    const companyA = await createCompany(orgA.id, { name: "Entreprise A" });

    await expect(getCompany(orgB.id, companyA.id)).rejects.toThrow(NotFoundError);
    await expect(updateCompany(orgB.id, companyA.id, { name: "Piraté" })).rejects.toThrow(NotFoundError);
    await expect(deleteCompany(orgB.id, companyA.id)).rejects.toThrow(NotFoundError);
  });

  it("crée une Property rattachée à un Lead et rejette un leadId d'une autre organisation", async () => {
    const { organization: orgA, lead: leadA } = await createOrgWithLead("property-crud-a");
    const { organization: orgB } = await createOrgWithLead("property-crud-b");

    const property = await createProperty(orgA.id, { leadId: leadA.id, label: "Villa Test", type: "VILLA" });
    expect(property.leadId).toBe(leadA.id);
    expect(property.type).toBe("VILLA");

    await expect(createProperty(orgB.id, { leadId: leadA.id, label: "Tentative", type: "VILLA" })).rejects.toThrow(
      ValidationError
    );

    const fetched = await getProperty(orgA.id, property.id);
    expect(fetched.lead.id).toBe(leadA.id);

    const updated = await updateProperty(orgA.id, property.id, { surfaceM2: 120 });
    expect(updated.surfaceM2).toBe(120);

    const listed = await listProperties(orgA.id, { leadId: leadA.id });
    expect(listed.map((p) => p.id)).toContain(property.id);

    await deleteProperty(orgA.id, property.id);
    await expect(getProperty(orgA.id, property.id)).rejects.toThrow(NotFoundError);
  });

  it("la suppression du Lead entraîne la suppression en cascade de ses Property", async () => {
    const { organization, lead } = await createOrgWithLead("property-cascade");
    const property = await createProperty(organization.id, { leadId: lead.id, label: "Bien à cascade", type: "APARTMENT" });

    await prisma.lead.delete({ where: { id: lead.id } });

    const stillThere = await prisma.property.findUnique({ where: { id: property.id } });
    expect(stillThere).toBeNull();
  });

  it("la suppression d'une Company remet Lead.companyId à null (jamais de suppression du Lead)", async () => {
    const { organization, lead } = await createOrgWithLead("company-setnull");
    const company = await createCompany(organization.id, { name: "Entreprise à supprimer" });
    await prisma.lead.update({ where: { id: lead.id }, data: { companyId: company.id } });

    await deleteCompany(organization.id, company.id);

    const refreshedLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(refreshedLead?.companyId).toBeNull();
  });

  it("crée une pièce jointe polymorphe sur un Lead et rejette une entityId d'une autre organisation", async () => {
    const { organization: orgA, lead: leadA } = await createOrgWithLead("attachment-crud-a");
    const { organization: orgB } = await createOrgWithLead("attachment-crud-b");

    const attachment = await createAttachment(orgA.id, null, {
      entityType: "Lead",
      entityId: leadA.id,
      category: "DOCUMENT",
      fileName: "contrat.pdf",
      url: "https://files.example.test/contrat.pdf",
    });
    expect(attachment.entityId).toBe(leadA.id);

    await expect(
      createAttachment(orgB.id, null, {
        entityType: "Lead",
        entityId: leadA.id,
        category: "DOCUMENT",
        fileName: "tentative.pdf",
        url: "https://files.example.test/tentative.pdf",
      })
    ).rejects.toThrow(ValidationError);

    const listed = await listAttachments(orgA.id, "Lead", leadA.id);
    expect(listed.map((a) => a.id)).toContain(attachment.id);

    await deleteAttachment(orgA.id, attachment.id);
    const remaining = await listAttachments(orgA.id, "Lead", leadA.id);
    expect(remaining.map((a) => a.id)).not.toContain(attachment.id);
  });

  it("deleteAttachment supprime réellement le fichier physique quand storageKey est renseigné (AR-0164)", async () => {
    const { organization, lead } = await createOrgWithLead("attachment-real-delete");
    const provider = new DemoStorageProvider();
    const { url, key } = await provider.upload({
      organizationId: organization.id,
      fileName: "contrat-reel.pdf",
      mimeType: "application/pdf",
      data: Buffer.from("contenu réel"),
    });

    const attachment = await createAttachment(organization.id, null, {
      entityType: "Lead",
      entityId: lead.id,
      category: "DOCUMENT",
      fileName: "contrat-reel.pdf",
      url,
      storageKey: key,
    });
    expect(attachment.storageKey).toBe(key);

    // Le fichier existe bien avant suppression.
    await expect(provider.download({ organizationId: organization.id, key })).resolves.toBeDefined();

    await deleteAttachment(organization.id, attachment.id);

    // La ligne ET le fichier physique ont disparu.
    const remaining = await listAttachments(organization.id, "Lead", lead.id);
    expect(remaining.map((a) => a.id)).not.toContain(attachment.id);
    await expect(provider.download({ organizationId: organization.id, key })).rejects.toThrow();
  });

  it("rejette une pièce jointe sur une Property d'une autre organisation", async () => {
    const { organization: orgA, lead: leadA } = await createOrgWithLead("attachment-property-a");
    const { organization: orgB } = await createOrgWithLead("attachment-property-b");
    const propertyA = await createProperty(orgA.id, { leadId: leadA.id, label: "Bien A", type: "OFFICE" });

    await expect(
      createAttachment(orgB.id, null, {
        entityType: "Property",
        entityId: propertyA.id,
        category: "PHOTO",
        fileName: "photo.jpg",
        url: "https://files.example.test/photo.jpg",
      })
    ).rejects.toThrow(ValidationError);
  });
});
