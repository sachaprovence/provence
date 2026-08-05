import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import type { comptaProductSchema, comptaProductUpdateSchema } from "@/lib/validations/compta";
import type { z } from "zod";

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
  const product = await prisma.comptaProduct.create({ data: { organizationId, ...data } });
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

  const product = await prisma.comptaProduct.update({ where: { id }, data });
  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_product.updated",
    entityType: "ComptaProduct",
    entityId: product.id,
  });
  return product;
}
