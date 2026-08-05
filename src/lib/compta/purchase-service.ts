import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ConflictError, ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { receiveStockForPurchaseOrder } from "@/lib/compta/stock-service";
import { ComptaPurchaseOrderStatus } from "@/generated/prisma/enums";
import type { comptaPurchaseOrderSchema, comptaPurchasePaymentSchema } from "@/lib/validations/compta";
import type { z } from "zod";

export async function listPurchaseOrders(organizationId: string, filters: { supplierId?: string } = {}) {
  return prisma.comptaPurchaseOrder.findMany({
    where: { organizationId, supplierId: filters.supplierId },
    include: { lines: true, supplier: { select: { id: true, name: true } }, payments: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPurchaseOrder(organizationId: string, id: string) {
  const order = await prisma.comptaPurchaseOrder.findFirst({
    where: { id, organizationId },
    include: { lines: true, supplier: true, payments: { orderBy: { paidAt: "desc" } } },
  });
  if (!order) throw new NotFoundError("Commande introuvable.");
  return order;
}

export async function createPurchaseOrder(
  organizationId: string,
  data: z.infer<typeof comptaPurchaseOrderSchema>,
  actorUserId: string
) {
  const supplier = await prisma.comptaSupplier.findFirst({ where: { id: data.supplierId, organizationId } });
  if (!supplier) throw new NotFoundError("Fournisseur introuvable.");

  const lines = data.lines.map((line) => ({ ...line, lineTotal: Math.round(line.quantity * line.unitCost) }));
  const totalAmount = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  const order = await prisma.comptaPurchaseOrder.create({
    data: {
      organizationId,
      supplierId: data.supplierId,
      status: ComptaPurchaseOrderStatus.DRAFT,
      notes: data.notes || undefined,
      totalAmount,
      createdById: actorUserId,
      lines: {
        create: lines.map((line) => ({
          ingredientId: line.ingredientId || undefined,
          label: line.label,
          quantity: line.quantity,
          unitCost: line.unitCost,
          lineTotal: line.lineTotal,
        })),
      },
    },
    include: { lines: true },
  });

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_purchase_order.created",
    entityType: "ComptaPurchaseOrder",
    entityId: order.id,
    metadata: { supplierId: data.supplierId, totalAmount: order.totalAmount },
  });

  return order;
}

export async function markPurchaseOrderOrdered(organizationId: string, id: string, actorUserId: string) {
  const existing = await prisma.comptaPurchaseOrder.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Commande introuvable.");
  if (existing.status !== ComptaPurchaseOrderStatus.DRAFT) {
    throw new ConflictError("Seule une commande en brouillon peut être passée.");
  }

  const order = await prisma.comptaPurchaseOrder.update({
    where: { id },
    data: { status: ComptaPurchaseOrderStatus.ORDERED, orderedAt: new Date() },
  });

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_purchase_order.ordered",
    entityType: "ComptaPurchaseOrder",
    entityId: id,
  });

  return order;
}

/**
 * Réception : incrémente le stock des ingrédients commandés (voir
 * `stock-service.ts#receiveStockForPurchaseOrder`) et porte le montant de
 * la commande au solde dû du fournisseur — c'est cet instant, pas la
 * création de la commande, qui matérialise une dette réelle envers le
 * fournisseur (la marchandise a été livrée). Acceptée depuis `DRAFT` ou
 * `ORDERED` : une pizzeria n'a pas toujours le temps de passer par l'étape
 * "commande passée" avant que le livreur arrive.
 */
export async function receivePurchaseOrder(organizationId: string, id: string, actorUserId: string) {
  const existing = await prisma.comptaPurchaseOrder.findFirst({ where: { id, organizationId }, include: { lines: true } });
  if (!existing) throw new NotFoundError("Commande introuvable.");
  if (existing.status === ComptaPurchaseOrderStatus.RECEIVED || existing.status === ComptaPurchaseOrderStatus.CANCELLED) {
    throw new ConflictError("Cette commande ne peut plus être réceptionnée.");
  }

  const order = await prisma.comptaPurchaseOrder.update({
    where: { id },
    data: { status: ComptaPurchaseOrderStatus.RECEIVED, receivedAt: new Date() },
  });

  await receiveStockForPurchaseOrder(
    organizationId,
    id,
    existing.lines.map((line) => ({ ingredientId: line.ingredientId, quantity: line.quantity }))
  );

  await prisma.comptaSupplier.update({
    where: { id: existing.supplierId },
    data: { balanceDue: { increment: existing.totalAmount } },
  });

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_purchase_order.received",
    entityType: "ComptaPurchaseOrder",
    entityId: id,
    metadata: { totalAmount: existing.totalAmount },
  });

  return order;
}

export async function cancelPurchaseOrder(organizationId: string, id: string, actorUserId: string) {
  const existing = await prisma.comptaPurchaseOrder.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Commande introuvable.");
  if (existing.status === ComptaPurchaseOrderStatus.RECEIVED) {
    throw new ConflictError("Une commande déjà réceptionnée ne peut pas être annulée.");
  }

  const order = await prisma.comptaPurchaseOrder.update({ where: { id }, data: { status: ComptaPurchaseOrderStatus.CANCELLED } });
  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_purchase_order.cancelled",
    entityType: "ComptaPurchaseOrder",
    entityId: id,
  });
  return order;
}

/** Paiement partiel ou complet d'une commande — même principe que `InvoicePayment` côté CRM. */
export async function recordPurchasePayment(
  organizationId: string,
  purchaseOrderId: string,
  data: z.infer<typeof comptaPurchasePaymentSchema>,
  actorUserId: string
) {
  const order = await prisma.comptaPurchaseOrder.findFirst({
    where: { id: purchaseOrderId, organizationId },
    include: { payments: true },
  });
  if (!order) throw new NotFoundError("Commande introuvable.");

  const alreadyPaid = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
  if (alreadyPaid + data.amount > order.totalAmount) {
    throw new ValidationError(
      `Le paiement dépasse le solde restant dû sur cette commande (${((order.totalAmount - alreadyPaid) / 100).toFixed(2)} €).`
    );
  }

  const payment = await prisma.comptaPurchasePayment.create({
    data: {
      organizationId,
      purchaseOrderId,
      amount: data.amount,
      paidAt: data.paidAt ?? new Date(),
      method: data.method,
      createdById: actorUserId,
    },
  });

  await prisma.comptaSupplier.update({
    where: { id: order.supplierId },
    data: { balanceDue: { decrement: data.amount } },
  });

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_purchase_payment.recorded",
    entityType: "ComptaPurchaseOrder",
    entityId: purchaseOrderId,
    metadata: { amount: data.amount, method: data.method },
  });

  return payment;
}

export async function getSupplierPurchaseStats(organizationId: string, supplierId: string) {
  const orders = await prisma.comptaPurchaseOrder.findMany({ where: { organizationId, supplierId } });
  const receivedOrders = orders.filter((order) => order.status === ComptaPurchaseOrderStatus.RECEIVED);

  return {
    orderCount: orders.length,
    receivedOrderCount: receivedOrders.length,
    totalReceivedAmount: receivedOrders.reduce((sum, order) => sum + order.totalAmount, 0),
  };
}
