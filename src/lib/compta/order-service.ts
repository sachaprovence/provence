import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ConflictError, ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { computeSaleTotals, createSale } from "@/lib/compta/sale-service";
import { ComptaOrderStatus } from "@/generated/prisma/enums";
import type { comptaOrderCheckoutSchema } from "@/lib/validations/compta";
import type { z } from "zod";

/** Numéro de commande séquentiel par organisation (jamais réutilisé) — même principe que `sale-service.ts#nextSaleReference`, sans découpage par année : "Commande #12" doit rester lisible pendant tout le service. */
async function nextOrderNumber(organizationId: string): Promise<number> {
  const last = await prisma.comptaOrder.findFirst({
    where: { organizationId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

/** Nom affiché : le nom saisi, ou "Commande #N" calculé — jamais stocké en dur pour rester correct si la commande est renommée plus tard. */
export function orderDisplayName(order: { name: string | null; number: number }): string {
  return order.name?.trim() ? order.name : `Commande #${order.number}`;
}

/** Totaux recalculés à la volée depuis les lignes — jamais stockés tant que la commande est OPEN (voir schema.prisma), pour ne jamais afficher un total désynchroniné des lignes réelles. Réutilise le même calcul que les ventes, jamais un second algorithme de TVA. */
export function computeOrderTotals(lines: { productId: string | null; productNameSnapshot: string; quantity: number; unitPriceTtcSnapshot: number; vatRateSnapshot: number }[]) {
  return computeSaleTotals(
    lines.map((line) => ({
      productId: line.productId,
      productName: line.productNameSnapshot,
      quantity: line.quantity,
      unitPrice: line.unitPriceTtcSnapshot,
      vatRate: line.vatRateSnapshot,
    })),
    0
  );
}

function withComputedTotals<T extends { lines: Parameters<typeof computeOrderTotals>[0] }>(order: T) {
  const totals = computeOrderTotals(order.lines);
  return { ...order, computedSubtotal: totals.subtotalAmount, computedVat: totals.vatAmount, computedTotal: totals.totalAmount };
}

export async function listOpenOrders(organizationId: string) {
  const orders = await prisma.comptaOrder.findMany({
    where: { organizationId, status: ComptaOrderStatus.OPEN },
    include: { lines: true },
    orderBy: { createdAt: "asc" },
  });
  return orders.map(withComputedTotals);
}

export async function listOrderHistory(
  organizationId: string,
  filters: { status?: "COMPLETED" | "CANCELLED"; from?: Date; to?: Date } = {}
) {
  return prisma.comptaOrder.findMany({
    where: {
      organizationId,
      status: filters.status ?? { in: [ComptaOrderStatus.COMPLETED, ComptaOrderStatus.CANCELLED] },
      createdAt: filters.from || filters.to ? { gte: filters.from, lt: filters.to } : undefined,
    },
    include: { lines: true, sale: { select: { id: true, reference: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrder(organizationId: string, id: string) {
  const order = await prisma.comptaOrder.findFirst({
    where: { id, organizationId },
    include: { lines: { orderBy: { createdAt: "asc" } }, sale: { select: { id: true, reference: true } }, customer: { select: { id: true, name: true } } },
  });
  if (!order) throw new NotFoundError("Commande introuvable.");
  return withComputedTotals(order);
}

export async function createOrder(organizationId: string, workspaceId: string | null, name: string | null | undefined, actorUserId: string) {
  const number = await nextOrderNumber(organizationId);
  const order = await prisma.comptaOrder.create({
    data: { organizationId, workspaceId: workspaceId ?? undefined, number, name: name?.trim() || undefined, createdById: actorUserId },
  });

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_order.created",
    entityType: "ComptaOrder",
    entityId: order.id,
    metadata: { number: order.number, name: order.name },
  });

  return getOrder(organizationId, order.id);
}

async function requireOpenOrder(organizationId: string, id: string) {
  const order = await prisma.comptaOrder.findFirst({ where: { id, organizationId }, include: { lines: true } });
  if (!order) throw new NotFoundError("Commande introuvable.");
  if (order.status !== ComptaOrderStatus.OPEN) {
    throw new ConflictError("Cette commande n'est plus ouverte — elle ne peut plus être modifiée.");
  }
  return order;
}

export async function renameOrder(organizationId: string, id: string, name: string | null | undefined, actorUserId: string) {
  await requireOpenOrder(organizationId, id);
  await prisma.comptaOrder.update({ where: { id }, data: { name: name?.trim() || null } });
  await writeAuditLog({ organizationId, userId: actorUserId, action: "compta_order.renamed", entityType: "ComptaOrder", entityId: id, metadata: { name } });
  return getOrder(organizationId, id);
}

/** Ajoute une unité du produit à la commande — un second appel sur le même produit incrémente la ligne existante plutôt que d'en créer une seconde (voir schema.prisma#ComptaOrderLine). Prix/TVA figés au moment de l'ajout. */
export async function addOrderItem(organizationId: string, orderId: string, productId: string, actorUserId: string) {
  const order = await requireOpenOrder(organizationId, orderId);
  const product = await prisma.comptaProduct.findFirst({ where: { id: productId, organizationId, isActive: true } });
  if (!product) throw new NotFoundError("Produit introuvable ou inactif.");

  const existingLine = order.lines.find((line) => line.productId === productId);
  if (existingLine) {
    await prisma.comptaOrderLine.update({ where: { id: existingLine.id }, data: { quantity: { increment: 1 } } });
  } else {
    await prisma.comptaOrderLine.create({
      data: {
        orderId,
        productId: product.id,
        productNameSnapshot: product.name,
        quantity: 1,
        unitPriceTtcSnapshot: product.price,
        vatRateSnapshot: product.vatRate,
      },
    });
  }

  await writeAuditLog({ organizationId, userId: actorUserId, action: "compta_order.item_added", entityType: "ComptaOrder", entityId: orderId, metadata: { productId } });
  return getOrder(organizationId, orderId);
}

/** `quantity: 0` supprime la ligne — jamais une ligne à quantité nulle laissée en base. */
export async function updateOrderItemQuantity(organizationId: string, orderId: string, itemId: string, quantity: number, actorUserId: string) {
  await requireOpenOrder(organizationId, orderId);
  const line = await prisma.comptaOrderLine.findFirst({ where: { id: itemId, orderId } });
  if (!line) throw new NotFoundError("Ligne de commande introuvable.");

  if (quantity <= 0) {
    await prisma.comptaOrderLine.delete({ where: { id: itemId } });
  } else {
    await prisma.comptaOrderLine.update({ where: { id: itemId }, data: { quantity } });
  }

  await writeAuditLog({ organizationId, userId: actorUserId, action: "compta_order.item_updated", entityType: "ComptaOrder", entityId: orderId, metadata: { itemId, quantity } });
  return getOrder(organizationId, orderId);
}

export async function removeOrderItem(organizationId: string, orderId: string, itemId: string, actorUserId: string) {
  await requireOpenOrder(organizationId, orderId);
  const line = await prisma.comptaOrderLine.findFirst({ where: { id: itemId, orderId } });
  if (!line) throw new NotFoundError("Ligne de commande introuvable.");

  await prisma.comptaOrderLine.delete({ where: { id: itemId } });
  await writeAuditLog({ organizationId, userId: actorUserId, action: "compta_order.item_removed", entityType: "ComptaOrder", entityId: orderId, metadata: { itemId } });
  return getOrder(organizationId, orderId);
}

/** Abandon avant encaissement — jamais transformée en vente, exclue du CA. Ne peut porter que sur une commande encore OPEN (protégé par le même claim conditionnel que `checkoutOrder`, contre un double-clic annulation/encaissement simultané). */
export async function cancelOrder(organizationId: string, id: string, reason: string | null | undefined, actorUserId: string) {
  const claim = await prisma.comptaOrder.updateMany({
    where: { id, organizationId, status: ComptaOrderStatus.OPEN },
    data: { status: ComptaOrderStatus.CANCELLED, cancelledAt: new Date() },
  });
  if (claim.count === 0) {
    const existing = await prisma.comptaOrder.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundError("Commande introuvable.");
    throw new ConflictError("Cette commande n'est plus ouverte.");
  }

  await writeAuditLog({ organizationId, userId: actorUserId, action: "compta_order.cancelled", entityType: "ComptaOrder", entityId: id, metadata: { reason: reason ?? undefined } });
  return getOrder(organizationId, id);
}

/**
 * Encaissement — transforme la commande en vente réelle via `sale-service.ts#createSale`
 * (jamais une seconde implémentation de la logique de vente : totaux, numérotation, décrément de
 * stock et fidélité viennent tous de ce même service). Protégé contre le double-clic par un
 * `updateMany` conditionnel (`WHERE status = 'OPEN'`) : sous PostgreSQL, une seule requête
 * concurrente peut gagner cette transition, la ou les autres reçoivent `count = 0` et échouent
 * proprement plutôt que de créer deux ventes. Si la création de la vente échoue après ce
 * "claim", la commande est explicitement remise à `OPEN` (jamais perdue silencieusement dans un
 * état intermédiaire).
 */
export async function checkoutOrder(
  organizationId: string,
  id: string,
  data: z.infer<typeof comptaOrderCheckoutSchema>,
  actorUserId: string
) {
  const order = await prisma.comptaOrder.findFirst({ where: { id, organizationId }, include: { lines: true } });
  if (!order) throw new NotFoundError("Commande introuvable.");
  if (order.lines.length === 0) throw new ValidationError("Impossible d'encaisser une commande vide.");

  const claim = await prisma.comptaOrder.updateMany({
    where: { id, organizationId, status: ComptaOrderStatus.OPEN },
    data: { status: ComptaOrderStatus.COMPLETED },
  });
  if (claim.count === 0) {
    throw new ConflictError("Cette commande vient d'être encaissée ou annulée.");
  }

  try {
    const sale = await createSale(
      organizationId,
      {
        soldAt: new Date(),
        paymentMethod: data.paymentMethod,
        discountPercent: 0,
        customerId: data.customerId || undefined,
        lines: order.lines.map((line) => ({
          productId: line.productId,
          productName: line.productNameSnapshot,
          quantity: line.quantity,
          unitPrice: line.unitPriceTtcSnapshot,
          vatRate: line.vatRateSnapshot,
        })),
      },
      actorUserId
    );

    const completed = await prisma.comptaOrder.update({
      where: { id },
      data: {
        saleId: sale.id,
        paymentMethod: data.paymentMethod,
        customerId: data.customerId || undefined,
        subtotalAmount: sale.subtotalAmount,
        vatAmount: sale.vatAmount,
        totalAmount: sale.totalAmount,
        completedAt: new Date(),
      },
    });

    await writeAuditLog({
      organizationId,
      userId: actorUserId,
      action: "compta_order.completed",
      entityType: "ComptaOrder",
      entityId: id,
      metadata: { saleId: sale.id, totalAmount: sale.totalAmount, paymentMethod: data.paymentMethod },
    });

    return { order: completed, sale };
  } catch (error) {
    await prisma.comptaOrder.updateMany({
      where: { id, organizationId, status: ComptaOrderStatus.COMPLETED, saleId: null },
      data: { status: ComptaOrderStatus.OPEN },
    });
    throw error;
  }
}
