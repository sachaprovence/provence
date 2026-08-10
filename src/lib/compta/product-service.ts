import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import type { comptaProductSchema, comptaProductUpdateSchema } from "@/lib/validations/compta";
import type { z } from "zod";

/** Quand un taux TVA nommé est sélectionné, son pourcentage courant devient la valeur numérique réellement utilisée (`vatRate`) — le taux fait toujours foi sur toute valeur envoyée manuellement en même temps. */
async function resolveVatRate(organizationId: string, vatRateId: string | null | undefined, fallbackVatRate: number) {
  if (!vatRateId) return { vatRateId: vatRateId ?? null, vatRate: fallbackVatRate };
  const rate = await prisma.comptaVatRate.findFirst({ where: { id: vatRateId, organizationId } });
  if (!rate) throw new ValidationError("Taux de TVA introuvable.");
  return { vatRateId: rate.id, vatRate: rate.rate };
}

export async function listProducts(
  organizationId: string,
  filters: { includeInactive?: boolean; favoritesOnly?: boolean } = {}
) {
  return prisma.comptaProduct.findMany({
    where: {
      organizationId,
      isActive: filters.includeInactive ? undefined : true,
      isFavorite: filters.favoritesOnly ? true : undefined,
    },
    orderBy: { name: "asc" },
  });
}

export async function getProduct(organizationId: string, id: string) {
  const product = await prisma.comptaProduct.findFirst({ where: { id, organizationId } });
  if (!product) throw new NotFoundError("Produit introuvable.");
  return product;
}

export async function createProduct(
  organizationId: string,
  data: z.infer<typeof comptaProductSchema>,
  actorUserId: string
) {
  const resolved = await resolveVatRate(organizationId, data.vatRateId, data.vatRate);
  const product = await prisma.comptaProduct.create({ data: { organizationId, ...data, ...resolved } });
  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_product.created",
    entityType: "ComptaProduct",
    entityId: product.id,
    metadata: { name: product.name, price: product.price },
  });
  return product;
}

export async function updateProduct(
  organizationId: string,
  id: string,
  data: z.infer<typeof comptaProductUpdateSchema>,
  actorUserId: string
) {
  const existing = await prisma.comptaProduct.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Produit introuvable.");

  // Ne résout/écrase `vatRate` que si un taux nommé est explicitement sélectionné dans cette
  // mise à jour — une mise à jour qui ne touche pas `vatRateId` ne doit jamais modifier le taux existant.
  const resolved = data.vatRateId ? await resolveVatRate(organizationId, data.vatRateId, existing.vatRate) : undefined;
  const product = await prisma.comptaProduct.update({ where: { id }, data: { ...data, ...resolved } });
  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_product.updated",
    entityType: "ComptaProduct",
    entityId: product.id,
  });
  return product;
}
