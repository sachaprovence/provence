import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { listTags, createTag, deleteTag, assignTagToLead, removeTagFromLead } from "@/lib/crm/tag-service";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Tags (v1.1, AR-0163) — le modèle existe depuis v0.9 sans aucune UI.
 * Couvre le CRUD, l'unicité par organisation, l'assignation/retrait sur un
 * Lead, et l'isolation multi-tenant.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("CRM v1.1 — Tag", () => {
  const organizationIds: string[] = [];

  async function createOrgWithLead(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org Tag ${suffix}` } });
    organizationIds.push(organization.id);
    const lead = await prisma.lead.create({
      data: { organizationId: organization.id, establishmentName: `Établissement ${suffix}` },
    });
    return { organization, lead };
  }

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  it("crée, liste et supprime un Tag", async () => {
    const { organization } = await createOrgWithLead("crud");

    const created = await createTag(organization.id, { name: "VIP", color: "#ff0000" });
    expect(created.name).toBe("VIP");
    expect(created.color).toBe("#ff0000");

    const listed = await listTags(organization.id);
    expect(listed.map((t) => t.id)).toContain(created.id);

    await deleteTag(organization.id, created.id);
    const listedAfterDelete = await listTags(organization.id);
    expect(listedAfterDelete.map((t) => t.id)).not.toContain(created.id);
  });

  it("rejette la création d'un tag portant un nom déjà utilisé dans l'organisation", async () => {
    const { organization } = await createOrgWithLead("uniq");
    await createTag(organization.id, { name: "Doublon" });

    await expect(createTag(organization.id, { name: "Doublon" })).rejects.toThrow(ValidationError);
  });

  it("permet le même nom de tag dans deux organisations différentes", async () => {
    const { organization: orgA } = await createOrgWithLead("uniq-a");
    const { organization: orgB } = await createOrgWithLead("uniq-b");

    await createTag(orgA.id, { name: "Partagé" });
    await expect(createTag(orgB.id, { name: "Partagé" })).resolves.toBeTruthy();
  });

  it("assigne et retire un tag sur un Lead", async () => {
    const { organization, lead } = await createOrgWithLead("assign");
    const tag = await createTag(organization.id, { name: "Chaud" });

    await assignTagToLead(organization.id, tag.id, lead.id);
    const afterAssign = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, include: { tagsRelation: true } });
    expect(afterAssign.tagsRelation.map((t) => t.id)).toContain(tag.id);

    await removeTagFromLead(organization.id, tag.id, lead.id);
    const afterRemove = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, include: { tagsRelation: true } });
    expect(afterRemove.tagsRelation.map((t) => t.id)).not.toContain(tag.id);
  });

  it("une organisation ne peut ni supprimer ni assigner le Tag d'une autre organisation", async () => {
    const { organization: orgA } = await createOrgWithLead("isolation-a");
    const { organization: orgB, lead: leadB } = await createOrgWithLead("isolation-b");
    const tagA = await createTag(orgA.id, { name: "Isolé" });

    await expect(deleteTag(orgB.id, tagA.id)).rejects.toThrow(NotFoundError);
    await expect(assignTagToLead(orgB.id, tagA.id, leadB.id)).rejects.toThrow(NotFoundError);
  });

  it("rejette l'assignation d'un tag à un Lead d'une autre organisation", async () => {
    const { organization: orgA } = await createOrgWithLead("cross-org-a");
    const { lead: leadB } = await createOrgWithLead("cross-org-b");
    const tagA = await createTag(orgA.id, { name: "CrossOrg" });

    await expect(assignTagToLead(orgA.id, tagA.id, leadB.id)).rejects.toThrow(NotFoundError);
  });
});
