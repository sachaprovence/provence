import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { ComptaStockMovementType } from "@/generated/prisma/enums";
import type { comptaIngredientSchema, comptaIngredientUpdateSchema, comptaRecipeLineSchema } from "@/lib/validations/compta";
import type { z } from "zod";

export async function listIngredients(organizationId: string) {
  return prisma.comptaIngredient.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export async function getIngredient(organizationId: string, id: string) {
  const ingredient = await prisma.comptaIngredient.findFirst({ where: { id, organizationId } });
  if (!ingredient) throw new NotFoundError("Ingrédient introuvable.");
  return ingredient;
}

export async function listLowStockIngredients(organizationId: string) {
  const ingredients = await prisma.comptaIngredient.findMany({
    where: { organizationId, lowStockThreshold: { not: null } },
    orderBy: { name: "asc" },
  });
  return ingredients.filter((i) => i.lowStockThreshold !== null && i.stockQuantity <= i.lowStockThreshold);
}

/**
 * Point d'entrée UNIQUE pour toute variation de stock — jamais un `update`
 * direct de `ComptaIngredient.stockQuantity` ailleurs dans le code. Écrit
 * systématiquement une ligne `ComptaStockMovement` (même transaction), pour
 * qu'un stock ne bouge jamais sans laisser de trace exploitable (inventaire,
 * export, litige avec un fournisseur). Le stock est autorisé à devenir
 * négatif (ex. vente qui dépasse le stock réellement en rayon) — bloquer une
 * vente pour une raison de stock irait contre la priorité absolue du module
 * (une vente doit toujours pouvoir être enregistrée) ; un stock négatif est
 * un signal à corriger via un inventaire, pas une erreur silencieuse.
 */
async function adjustStock(params: {
  organizationId: string;
  ingredientId: string;
  type: ComptaStockMovementType;
  quantityDelta: number;
  reason?: string | null;
  relatedSaleId?: string | null;
  relatedPurchaseOrderId?: string | null;
  createdById?: string | null;
}): Promise<number> {
  const ingredient = await prisma.comptaIngredient.findFirst({
    where: { id: params.ingredientId, organizationId: params.organizationId },
  });
  if (!ingredient) throw new NotFoundError("Ingrédient introuvable.");

  const resultingQuantity = ingredient.stockQuantity + params.quantityDelta;

  await prisma.$transaction([
    prisma.comptaIngredient.update({ where: { id: ingredient.id }, data: { stockQuantity: resultingQuantity } }),
    prisma.comptaStockMovement.create({
      data: {
        organizationId: params.organizationId,
        ingredientId: ingredient.id,
        type: params.type,
        quantityDelta: params.quantityDelta,
        resultingQuantity,
        reason: params.reason ?? undefined,
        relatedSaleId: params.relatedSaleId ?? undefined,
        relatedPurchaseOrderId: params.relatedPurchaseOrderId ?? undefined,
        createdById: params.createdById ?? undefined,
      },
    }),
  ]);

  return resultingQuantity;
}

export async function createIngredient(
  organizationId: string,
  data: z.infer<typeof comptaIngredientSchema>,
  actorUserId: string
) {
  const ingredient = await prisma.comptaIngredient.create({
    data: { organizationId, name: data.name, unit: data.unit, stockQuantity: 0, lowStockThreshold: data.lowStockThreshold, unitCost: data.unitCost },
  });

  if (data.stockQuantity && data.stockQuantity !== 0) {
    await adjustStock({
      organizationId,
      ingredientId: ingredient.id,
      type: ComptaStockMovementType.INITIAL,
      quantityDelta: data.stockQuantity,
      reason: "Stock initial",
      createdById: actorUserId,
    });
  }

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_ingredient.created",
    entityType: "ComptaIngredient",
    entityId: ingredient.id,
    metadata: { name: ingredient.name },
  });

  return getIngredient(organizationId, ingredient.id);
}

export async function updateIngredient(
  organizationId: string,
  id: string,
  data: z.infer<typeof comptaIngredientUpdateSchema>,
  actorUserId: string
) {
  const existing = await prisma.comptaIngredient.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Ingrédient introuvable.");

  const ingredient = await prisma.comptaIngredient.update({ where: { id }, data });
  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_ingredient.updated",
    entityType: "ComptaIngredient",
    entityId: ingredient.id,
  });
  return ingredient;
}

/** Inventaire / ajustement manuel — l'utilisateur saisit le stock RÉEL constaté, pas une variation. */
export async function correctStock(
  organizationId: string,
  ingredientId: string,
  newQuantity: number,
  reason: string,
  actorUserId: string
) {
  const ingredient = await prisma.comptaIngredient.findFirst({ where: { id: ingredientId, organizationId } });
  if (!ingredient) throw new NotFoundError("Ingrédient introuvable.");

  const delta = newQuantity - ingredient.stockQuantity;
  await adjustStock({
    organizationId,
    ingredientId,
    type: ComptaStockMovementType.CORRECTION,
    quantityDelta: delta,
    reason,
    createdById: actorUserId,
  });

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_ingredient.stock_corrected",
    entityType: "ComptaIngredient",
    entityId: ingredientId,
    metadata: { previousQuantity: ingredient.stockQuantity, newQuantity, reason },
  });

  return getIngredient(organizationId, ingredientId);
}

export async function listStockMovements(organizationId: string, ingredientId?: string, limit = 50) {
  return prisma.comptaStockMovement.findMany({
    where: { organizationId, ingredientId },
    include: { ingredient: { select: { id: true, name: true, unit: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getRecipe(organizationId: string, productId: string) {
  return prisma.comptaRecipeLine.findMany({
    where: { organizationId, productId },
    include: { ingredient: true },
  });
}

/** Remplace intégralement la recette d'un produit (jamais un diff ligne par ligne — priorité à la simplicité). */
export async function setRecipe(
  organizationId: string,
  productId: string,
  lines: z.infer<typeof comptaRecipeLineSchema>[],
  actorUserId: string
) {
  const product = await prisma.comptaProduct.findFirst({ where: { id: productId, organizationId } });
  if (!product) throw new NotFoundError("Produit introuvable.");

  await prisma.$transaction([
    prisma.comptaRecipeLine.deleteMany({ where: { organizationId, productId } }),
    ...(lines.length > 0
      ? [
          prisma.comptaRecipeLine.createMany({
            data: lines.map((line) => ({ organizationId, productId, ingredientId: line.ingredientId, quantity: line.quantity })),
          }),
        ]
      : []),
  ]);

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_recipe.updated",
    entityType: "ComptaProduct",
    entityId: productId,
    metadata: { lineCount: lines.length },
  });

  return getRecipe(organizationId, productId);
}

/**
 * Supprime intégralement la recette d'un produit — ne touche jamais au
 * produit lui-même ni à l'historique des ventes déjà réalisées (les lignes
 * de vente conservent leur propre copie figée du prix/de la TVA, sans lien
 * de calcul vivant vers la recette). Réutilise `setRecipe([])` pour la
 * transaction (une seule façon de vider une recette), avec une action
 * d'audit dédiée pour rester lisible dans le journal.
 */
export async function deleteRecipe(organizationId: string, productId: string, actorUserId: string) {
  const product = await prisma.comptaProduct.findFirst({ where: { id: productId, organizationId } });
  if (!product) throw new NotFoundError("Produit introuvable.");

  const existing = await getRecipe(organizationId, productId);
  if (existing.length === 0) throw new NotFoundError("Aucune recette configurée pour ce produit.");

  await prisma.comptaRecipeLine.deleteMany({ where: { organizationId, productId } });

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_recipe.deleted",
    entityType: "ComptaProduct",
    entityId: productId,
    metadata: { lineCount: existing.length, productName: product.name },
  });
}

/**
 * Décrémente le stock des ingrédients pour les lignes de vente qui ont un
 * produit avec une recette — appelée depuis `sale-service.ts#createSale`
 * après la création de la vente. Best-effort par ligne : une ligne sans
 * recette (produit libre, ou produit sans recette configurée) ne fait
 * simplement rien, ce n'est jamais une erreur bloquante.
 */
export async function deductStockForSale(
  organizationId: string,
  saleId: string,
  lines: { productId: string | null; quantity: number }[]
) {
  const productIds = lines.map((l) => l.productId).filter((id): id is string => Boolean(id));
  if (productIds.length === 0) return;

  const recipeLines = await prisma.comptaRecipeLine.findMany({ where: { organizationId, productId: { in: productIds } } });
  if (recipeLines.length === 0) return;

  const recipeByProduct = new Map<string, typeof recipeLines>();
  for (const recipeLine of recipeLines) {
    const existing = recipeByProduct.get(recipeLine.productId) ?? [];
    existing.push(recipeLine);
    recipeByProduct.set(recipeLine.productId, existing);
  }

  for (const line of lines) {
    if (!line.productId) continue;
    const recipe = recipeByProduct.get(line.productId);
    if (!recipe) continue;
    for (const recipeLine of recipe) {
      await adjustStock({
        organizationId,
        ingredientId: recipeLine.ingredientId,
        type: ComptaStockMovementType.SALE_DEDUCTION,
        quantityDelta: -recipeLine.quantity * line.quantity,
        relatedSaleId: saleId,
      });
    }
  }
}

/** Incrément de stock à la réception d'une commande fournisseur — voir `purchase-service.ts`. */
export async function receiveStockForPurchaseOrder(
  organizationId: string,
  purchaseOrderId: string,
  lines: { ingredientId: string | null; quantity: number }[]
) {
  for (const line of lines) {
    if (!line.ingredientId) continue;
    await adjustStock({
      organizationId,
      ingredientId: line.ingredientId,
      type: ComptaStockMovementType.PURCHASE_RECEPTION,
      quantityDelta: line.quantity,
      relatedPurchaseOrderId: purchaseOrderId,
    });
  }
}
