import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { propertyCreateSchema, propertyUpdateSchema } from "@/lib/validations/crm";
import type { z } from "zod";

/**
 * Le bien physique candidat à une visite virtuelle — distinct du `Lead` qui
 * le représente commercialement (v0.9, ADR 0038). Toujours rattaché à un
 * `Lead` de l'organisation ; optionnellement regroupé sous une `Company`.
 */

export async function listProperties(organizationId: string, filters: { leadId?: string; companyId?: string } = {}) {
  return prisma.property.findMany({
    where: {
      organizationId,
      leadId: filters.leadId || undefined,
      companyId: filters.companyId || undefined,
    },
    include: { lead: { select: { id: true, establishmentName: true } }, _count: { select: { virtualTours: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProperty(organizationId: string, id: string) {
  const property = await prisma.property.findFirst({
    where: { id, organizationId },
    include: { lead: true, company: true, virtualTours: { orderBy: { createdAt: "desc" } } },
  });
  if (!property) throw new NotFoundError("Bien immobilier introuvable.");
  return property;
}

async function assertLeadInOrganization(organizationId: string, leadId: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId }, select: { id: true } });
  if (!lead) throw new ValidationError("Le prospect/client indiqué est introuvable dans cette organisation.");
}

async function assertCompanyInOrganization(organizationId: string, companyId: string) {
  const company = await prisma.company.findFirst({ where: { id: companyId, organizationId }, select: { id: true } });
  if (!company) throw new ValidationError("L'entreprise indiquée est introuvable dans cette organisation.");
}

export async function createProperty(organizationId: string, data: z.infer<typeof propertyCreateSchema>) {
  await assertLeadInOrganization(organizationId, data.leadId);
  if (data.companyId) await assertCompanyInOrganization(organizationId, data.companyId);

  return prisma.property.create({
    data: {
      organizationId,
      workspaceId: data.workspaceId || undefined,
      leadId: data.leadId,
      companyId: data.companyId || undefined,
      type: data.type,
      label: data.label,
      address: data.address || undefined,
      city: data.city || undefined,
      region: data.region || undefined,
      country: data.country || "France",
      latitude: data.latitude ?? undefined,
      longitude: data.longitude ?? undefined,
      surfaceM2: data.surfaceM2 ?? undefined,
      notes: data.notes || undefined,
    },
  });
}

export async function updateProperty(organizationId: string, id: string, data: z.infer<typeof propertyUpdateSchema>) {
  const existing = await prisma.property.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Bien immobilier introuvable.");
  if (data.companyId) await assertCompanyInOrganization(organizationId, data.companyId);

  return prisma.property.update({
    where: { id },
    data: {
      workspaceId: data.workspaceId === undefined ? undefined : data.workspaceId || null,
      companyId: data.companyId === undefined ? undefined : data.companyId || null,
      type: data.type,
      label: data.label,
      address: data.address === undefined ? undefined : data.address || null,
      city: data.city === undefined ? undefined : data.city || null,
      region: data.region === undefined ? undefined : data.region || null,
      country: data.country,
      latitude: data.latitude === undefined ? undefined : data.latitude,
      longitude: data.longitude === undefined ? undefined : data.longitude,
      surfaceM2: data.surfaceM2 === undefined ? undefined : data.surfaceM2,
      notes: data.notes === undefined ? undefined : data.notes || null,
    },
  });
}

export async function deleteProperty(organizationId: string, id: string) {
  const existing = await prisma.property.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Bien immobilier introuvable.");
  await prisma.property.delete({ where: { id } });
}
