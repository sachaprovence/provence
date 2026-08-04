import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import type { contactCreateSchema, contactUpdateSchema, contactLinkSchema } from "@/lib/validations/crm";
import type { z } from "zod";

/**
 * Personne physique (v1.1, AR-0160) — scopée organisation/workspace,
 * jamais à un seul `Lead`, peut être liée à plusieurs `Lead`/`Company`.
 * Additive par rapport à `LeadContact` (contact opérationnel de
 * messagerie, scopé à un seul Lead, inchangé) — voir docs/adr/0043.
 */

export async function listContacts(organizationId: string) {
  return prisma.contact.findMany({
    where: { organizationId },
    include: { _count: { select: { leadLinks: true, companyLinks: true } } },
    orderBy: { fullName: "asc" },
  });
}

export async function getContact(organizationId: string, id: string) {
  const contact = await prisma.contact.findFirst({
    where: { id, organizationId },
    include: {
      leadLinks: { include: { lead: { select: { id: true, establishmentName: true } } } },
      companyLinks: { include: { company: { select: { id: true, name: true } } } },
    },
  });
  if (!contact) throw new NotFoundError("Contact introuvable.");
  return contact;
}

export async function createContact(organizationId: string, data: z.infer<typeof contactCreateSchema>) {
  return prisma.contact.create({
    data: {
      organizationId,
      workspaceId: data.workspaceId || undefined,
      fullName: data.fullName,
      jobTitle: data.jobTitle || undefined,
      email: data.email || undefined,
      phone: data.phone || undefined,
      notes: data.notes || undefined,
    },
  });
}

export async function updateContact(organizationId: string, id: string, data: z.infer<typeof contactUpdateSchema>) {
  const existing = await prisma.contact.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Contact introuvable.");

  return prisma.contact.update({
    where: { id },
    data: {
      workspaceId: data.workspaceId === undefined ? undefined : data.workspaceId || null,
      fullName: data.fullName,
      jobTitle: data.jobTitle === undefined ? undefined : data.jobTitle || null,
      email: data.email === undefined ? undefined : data.email || null,
      phone: data.phone === undefined ? undefined : data.phone || null,
      notes: data.notes === undefined ? undefined : data.notes || null,
    },
  });
}

export async function deleteContact(organizationId: string, id: string) {
  const existing = await prisma.contact.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Contact introuvable.");
  await prisma.contact.delete({ where: { id } });
}

/** Liste les personnes liées à un Lead (relations `Contact` — distinct de `Lead.contacts`/`LeadContact`, voir docs/adr/0043). */
export async function listContactsForLead(organizationId: string, leadId: string) {
  return prisma.leadContactRelation.findMany({
    where: { leadId, contact: { organizationId } },
    include: { contact: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function linkContactToLead(organizationId: string, contactId: string, leadId: string, data: z.infer<typeof contactLinkSchema>) {
  const [contact, lead] = await Promise.all([
    prisma.contact.findFirst({ where: { id: contactId, organizationId } }),
    prisma.lead.findFirst({ where: { id: leadId, organizationId } }),
  ]);
  if (!contact) throw new NotFoundError("Contact introuvable.");
  if (!lead) throw new NotFoundError("Prospect introuvable.");

  return prisma.leadContactRelation.upsert({
    where: { contactId_leadId: { contactId, leadId } },
    create: { contactId, leadId, role: data.role || undefined },
    update: { role: data.role === undefined ? undefined : data.role || null },
  });
}

export async function unlinkContactFromLead(organizationId: string, contactId: string, leadId: string) {
  const link = await prisma.leadContactRelation.findFirst({
    where: { contactId, leadId, contact: { organizationId } },
  });
  if (!link) throw new NotFoundError("Liaison introuvable.");
  await prisma.leadContactRelation.delete({ where: { id: link.id } });
}

/** Liste les personnes liées à une Company. */
export async function listContactsForCompany(organizationId: string, companyId: string) {
  return prisma.companyContactRelation.findMany({
    where: { companyId, contact: { organizationId } },
    include: { contact: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function linkContactToCompany(organizationId: string, contactId: string, companyId: string, data: z.infer<typeof contactLinkSchema>) {
  const [contact, company] = await Promise.all([
    prisma.contact.findFirst({ where: { id: contactId, organizationId } }),
    prisma.company.findFirst({ where: { id: companyId, organizationId } }),
  ]);
  if (!contact) throw new NotFoundError("Contact introuvable.");
  if (!company) throw new NotFoundError("Entreprise introuvable.");

  return prisma.companyContactRelation.upsert({
    where: { contactId_companyId: { contactId, companyId } },
    create: { contactId, companyId, role: data.role || undefined },
    update: { role: data.role === undefined ? undefined : data.role || null },
  });
}

export async function unlinkContactFromCompany(organizationId: string, contactId: string, companyId: string) {
  const link = await prisma.companyContactRelation.findFirst({
    where: { contactId, companyId, contact: { organizationId } },
  });
  if (!link) throw new NotFoundError("Liaison introuvable.");
  await prisma.companyContactRelation.delete({ where: { id: link.id } });
}
