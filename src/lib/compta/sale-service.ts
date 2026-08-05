import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { extractVatFromTtc } from "@/lib/compta/money";
import { deductStockForSale } from "@/lib/compta/stock-service";
import { accrueLoyaltyPoints } from "@/lib/compta/customer-service";
import { logger } from "@/lib/logger";
import { ComptaSaleStatus } from "@/generated/prisma/enums";
import type { comptaSaleSchema } from "@/lib/validations/compta";
import type { z } from "zod";

/**
 * Calcule les montants d'une vente à partir de ses lignes (prix unitaire
 * TTC) et de la remise globale. La remise est appliquée ligne par ligne
 * (pas seulement sur le total) afin que la TVA — dont le taux peut différer
 * d'une ligne à l'autre (ex. pizza 10% vs boisson 20%) — reste exacte après
 * remise, plutôt qu'une approximation sur un taux moyen.
 */
function computeSaleTotals(lines: z.infer<typeof comptaSaleSchema>["lines"], discountPercent: number) {
  const discountFactor = 1 - discountPercent / 100;
  let subtotalAmount = 0;
  let totalAmount = 0;
  let vatAmount = 0;

  const computedLines = lines.map((line) => {
    const lineTotal = line.quantity * line.unitPrice;
    subtotalAmount += lineTotal;
    const discountedLineTotal = Math.round(lineTotal * discountFactor);
    totalAmount += discountedLineTotal;
    vatAmount += extractVatFromTtc(discountedLineTotal, line.vatRate);
    return { ...line, lineTotal };
  });

  return { subtotalAmount, totalAmount, vatAmount, lines: computedLines };
}

/** Numéro de vente séquentiel par organisation et par année, ex. "V-2026-0001" — même convention que `Invoice`/`Quote` (task existante). */
async function nextSaleReference(organizationId: string, date: Date): Promise<string> {
  const year = date.getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const count = await prisma.comptaSale.count({ where: { organizationId, soldAt: { gte: start, lt: end } } });
  return `V-${year}-${String(count + 1).padStart(4, "0")}`;
}

export async function listSales(
  organizationId: string,
  filters: { from?: Date; to?: Date; includeCancelled?: boolean; search?: string } = {}
) {
  return prisma.comptaSale.findMany({
    where: {
      organizationId,
      soldAt: filters.from || filters.to ? { gte: filters.from, lt: filters.to } : undefined,
      status: filters.includeCancelled ? undefined : { not: ComptaSaleStatus.CANCELLED },
      ...(filters.search
        ? {
            OR: [
              { reference: { contains: filters.search, mode: "insensitive" as const } },
              { customer: { name: { contains: filters.search, mode: "insensitive" as const } } },
              { lines: { some: { productName: { contains: filters.search, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    },
    include: { lines: true, customer: { select: { id: true, name: true } } },
    orderBy: { soldAt: "desc" },
  });
}

export async function getSale(organizationId: string, id: string) {
  const sale = await prisma.comptaSale.findFirst({
    where: { id, organizationId },
    include: { lines: true, customer: { select: { id: true, name: true } }, refunds: true },
  });
  if (!sale) throw new NotFoundError("Vente introuvable.");
  return sale;
}

export async function createSale(
  organizationId: string,
  data: z.infer<typeof comptaSaleSchema>,
  actorUserId: string
) {
  const { subtotalAmount, totalAmount, vatAmount, lines } = computeSaleTotals(data.lines, data.discountPercent);
  const reference = await nextSaleReference(organizationId, data.soldAt);

  const sale = await prisma.comptaSale.create({
    data: {
      organizationId,
      soldAt: data.soldAt,
      paymentMethod: data.paymentMethod,
      discountPercent: data.discountPercent,
      notes: data.notes || undefined,
      customerId: data.customerId || undefined,
      reference,
      subtotalAmount,
      vatAmount,
      totalAmount,
      createdById: actorUserId,
      lines: {
        create: lines.map((line) => ({
          productId: line.productId || undefined,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          vatRate: line.vatRate,
          lineTotal: line.lineTotal,
        })),
      },
    },
    include: { lines: true },
  });

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_sale.created",
    entityType: "ComptaSale",
    entityId: sale.id,
    metadata: { totalAmount: sale.totalAmount, paymentMethod: sale.paymentMethod, reference: sale.reference },
  });

  // Best-effort : le stock et la fidélité ne doivent jamais faire échouer l'enregistrement
  // d'une vente (priorité absolue du module) — une erreur ici est journalisée, pas propagée.
  try {
    await deductStockForSale(
      organizationId,
      sale.id,
      sale.lines.map((line) => ({ productId: line.productId, quantity: line.quantity }))
    );
  } catch (error) {
    logger.error({ err: error, saleId: sale.id }, "Échec de la décrémentation de stock pour une vente.");
  }

  if (data.customerId) {
    try {
      await accrueLoyaltyPoints(organizationId, data.customerId, sale.totalAmount);
    } catch (error) {
      logger.error({ err: error, saleId: sale.id, customerId: data.customerId }, "Échec du crédit de points de fidélité.");
    }
  }

  return sale;
}

/** Raccourci "mode rapide" — vente 1 ligne, quantité 1, espèces, prix catalogue. */
export async function createQuickSale(organizationId: string, productId: string, actorUserId: string) {
  const product = await prisma.comptaProduct.findFirst({ where: { id: productId, organizationId, isActive: true } });
  if (!product) throw new NotFoundError("Produit introuvable ou inactif.");

  return createSale(
    organizationId,
    {
      soldAt: new Date(),
      paymentMethod: "CASH",
      discountPercent: 0,
      lines: [{ productId: product.id, productName: product.name, quantity: 1, unitPrice: product.price, vatRate: product.vatRate }],
    },
    actorUserId
  );
}

/** Produits les plus vendus sur une période — alimente les tuiles du mode rapide et le tableau de bord. */
export async function listTopSellingProducts(organizationId: string, options: { days?: number; limit?: number } = {}) {
  const days = options.days ?? 30;
  const limit = options.limit ?? 8;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const grouped = await prisma.comptaSaleLine.groupBy({
    by: ["productId"],
    where: { productId: { not: null }, sale: { organizationId, soldAt: { gte: since }, status: { not: ComptaSaleStatus.CANCELLED } } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: limit,
  });

  const productIds = grouped.map((g) => g.productId).filter((id): id is string => Boolean(id));
  if (productIds.length === 0) return [];

  const products = await prisma.comptaProduct.findMany({ where: { id: { in: productIds }, organizationId } });
  const productById = new Map(products.map((p) => [p.id, p]));

  return grouped
    .map((g) => ({ product: g.productId ? productById.get(g.productId) : undefined, quantitySold: g._sum.quantity ?? 0 }))
    .filter((entry): entry is { product: NonNullable<typeof entry.product>; quantitySold: number } => Boolean(entry.product));
}

export async function deleteSale(organizationId: string, id: string, actorUserId: string) {
  const existing = await prisma.comptaSale.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Vente introuvable.");

  await prisma.comptaSale.delete({ where: { id } });
  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_sale.deleted",
    entityType: "ComptaSale",
    entityId: id,
    metadata: { totalAmount: existing.totalAmount },
  });
}

/** Annulation (saisie erronée) — jamais de suppression physique : la vente reste visible, exclue des agrégats. */
export async function cancelSale(organizationId: string, id: string, reason: string | null | undefined, actorUserId: string) {
  const existing = await prisma.comptaSale.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Vente introuvable.");
  if (existing.status !== ComptaSaleStatus.COMPLETED) {
    throw new ConflictError("Seule une vente en cours peut être annulée.");
  }

  const sale = await prisma.comptaSale.update({
    where: { id },
    data: { status: ComptaSaleStatus.CANCELLED },
  });

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_sale.cancelled",
    entityType: "ComptaSale",
    entityId: id,
    metadata: { reason: reason ?? undefined },
  });

  return sale;
}

/**
 * Remboursement intégral — crée une NOUVELLE vente liée (`status = REFUNDED`,
 * montants négatifs), ne modifie jamais la vente d'origine (qui reste
 * `COMPLETED` : le CA du jour où elle a eu lieu ne doit pas bouger
 * rétroactivement). Pas de restock automatique des ingrédients — un
 * remboursement n'implique pas que la nourriture soit physiquement revenue
 * en stock.
 */
export async function refundSale(organizationId: string, id: string, reason: string | null | undefined, actorUserId: string) {
  const original = await prisma.comptaSale.findFirst({ where: { id, organizationId }, include: { lines: true } });
  if (!original) throw new NotFoundError("Vente introuvable.");
  if (original.status !== ComptaSaleStatus.COMPLETED) {
    throw new ConflictError("Seule une vente en cours peut être remboursée.");
  }

  const existingRefund = await prisma.comptaSale.findFirst({
    where: { organizationId, refundOfSaleId: id, status: ComptaSaleStatus.REFUNDED },
  });
  if (existingRefund) {
    throw new ConflictError("Cette vente a déjà été remboursée.");
  }

  const reference = await nextSaleReference(organizationId, new Date());

  const refund = await prisma.comptaSale.create({
    data: {
      organizationId,
      soldAt: new Date(),
      paymentMethod: original.paymentMethod,
      discountPercent: 0,
      subtotalAmount: -original.subtotalAmount,
      vatAmount: -original.vatAmount,
      totalAmount: -original.totalAmount,
      notes: reason ? `Remboursement de ${original.reference ?? original.id} : ${reason}` : `Remboursement de ${original.reference ?? original.id}`,
      customerId: original.customerId,
      reference,
      status: ComptaSaleStatus.REFUNDED,
      refundOfSaleId: original.id,
      createdById: actorUserId,
      lines: {
        create: original.lines.map((line) => ({
          productId: line.productId,
          productName: line.productName,
          quantity: -line.quantity,
          unitPrice: line.unitPrice,
          vatRate: line.vatRate,
          lineTotal: -line.lineTotal,
        })),
      },
    },
    include: { lines: true },
  });

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_sale.refunded",
    entityType: "ComptaSale",
    entityId: refund.id,
    metadata: { refundOfSaleId: original.id, totalAmount: refund.totalAmount, reason: reason ?? undefined },
  });

  return refund;
}
