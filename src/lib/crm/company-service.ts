import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import type { companyCreateSchema, companyUpdateSchema } from "@/lib/validations/crm";
import type { z } from "zod";

/**
 * Regroupement optionnel de plusieurs `Lead` sous une même entité juridique
 * (groupe hôtelier, réseau d'agences...) — v0.9, ADR 0038. Jamais requis :
 * un `Lead` sans `companyId` reste géré normalement.
 */

export async function listCompanies(organizationId: string) {
  return prisma.company.findMany({
    where: { organizationId },
    include: { _count: { select: { leads: true, properties: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getCompany(organizationId: string, id: string) {
  const company = await prisma.company.findFirst({
    where: { id, organizationId },
    include: {
      leads: { orderBy: { createdAt: "desc" } },
      properties: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!company) throw new NotFoundError("Entreprise introuvable.");
  return company;
}

export async function createCompany(organizationId: string, data: z.infer<typeof companyCreateSchema>) {
  return prisma.company.create({
    data: {
      organizationId,
      workspaceId: data.workspaceId || undefined,
      name: data.name,
      legalName: data.legalName || undefined,
      siret: data.siret || undefined,
      website: data.website || undefined,
      address: data.address || undefined,
      city: data.city || undefined,
      country: data.country || "France",
      notes: data.notes || undefined,
    },
  });
}

export async function updateCompany(organizationId: string, id: string, data: z.infer<typeof companyUpdateSchema>) {
  const existing = await prisma.company.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Entreprise introuvable.");

  return prisma.company.update({
    where: { id },
    data: {
      workspaceId: data.workspaceId === undefined ? undefined : data.workspaceId || null,
      name: data.name,
      legalName: data.legalName === undefined ? undefined : data.legalName || null,
      siret: data.siret === undefined ? undefined : data.siret || null,
      website: data.website === undefined ? undefined : data.website || null,
      address: data.address === undefined ? undefined : data.address || null,
      city: data.city === undefined ? undefined : data.city || null,
      country: data.country,
      notes: data.notes === undefined ? undefined : data.notes || null,
    },
  });
}

export async function deleteCompany(organizationId: string, id: string) {
  const existing = await prisma.company.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Entreprise introuvable.");
  await prisma.company.delete({ where: { id } });
}
