import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { tagCreateSchema } from "@/lib/validations/crm";
import type { z } from "zod";

/**
 * Tags (v1.1, AR-0163) — le modèle existe depuis v0.9 (relation implicite
 * `Lead`↔`Tag`) mais n'était ni créé, ni affiché, ni filtrable dans aucune
 * UI. Toujours scopé organisation.
 */

export async function listTags(organizationId: string) {
  return prisma.tag.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export async function createTag(organizationId: string, data: z.infer<typeof tagCreateSchema>) {
  const existing = await prisma.tag.findUnique({ where: { organizationId_name: { organizationId, name: data.name } } });
  if (existing) throw new ValidationError("Un tag porte déjà ce nom.");

  return prisma.tag.create({
    data: { organizationId, name: data.name, color: data.color || undefined },
  });
}

export async function deleteTag(organizationId: string, id: string) {
  const existing = await prisma.tag.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Tag introuvable.");
  await prisma.tag.delete({ where: { id } });
}

export async function assignTagToLead(organizationId: string, tagId: string, leadId: string) {
  const [tag, lead] = await Promise.all([
    prisma.tag.findFirst({ where: { id: tagId, organizationId } }),
    prisma.lead.findFirst({ where: { id: leadId, organizationId } }),
  ]);
  if (!tag) throw new NotFoundError("Tag introuvable.");
  if (!lead) throw new NotFoundError("Prospect introuvable.");

  await prisma.lead.update({ where: { id: leadId }, data: { tagsRelation: { connect: { id: tagId } } } });
}

export async function removeTagFromLead(organizationId: string, tagId: string, leadId: string) {
  const [tag, lead] = await Promise.all([
    prisma.tag.findFirst({ where: { id: tagId, organizationId } }),
    prisma.lead.findFirst({ where: { id: leadId, organizationId } }),
  ]);
  if (!tag) throw new NotFoundError("Tag introuvable.");
  if (!lead) throw new NotFoundError("Prospect introuvable.");

  await prisma.lead.update({ where: { id: leadId }, data: { tagsRelation: { disconnect: { id: tagId } } } });
}
