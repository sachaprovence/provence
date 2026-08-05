import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { extractVatFromTtc } from "@/lib/compta/money";
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

export async function listSales(
  organizationId: string,
  filters: { from?: Date; to?: Date } = {}
) {
  return prisma.comptaSale.findMany({
    where: {
      organizationId,
      soldAt: filters.from || filters.to ? { gte: filters.from, lt: filters.to } : undefined,
    },
    include: { lines: true },
    orderBy: { soldAt: "desc" },
  });
}

export async function getSale(organizationId: string, id: string) {
  const sale = await prisma.comptaSale.findFirst({ where: { id, organizationId }, include: { lines: true } });
  if (!sale) throw new NotFoundError("Vente introuvable.");
  return sale;
}

export async function createSale(
  organizationId: string,
  data: z.infer<typeof comptaSaleSchema>,
  actorUserId: string
) {
  const { subtotalAmount, totalAmount, vatAmount, lines } = computeSaleTotals(data.lines, data.discountPercent);

  const sale = await prisma.comptaSale.create({
    data: {
      organizationId,
      soldAt: data.soldAt,
      paymentMethod: data.paymentMethod,
      discountPercent: data.discountPercent,
      notes: data.notes || undefined,
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
    metadata: { totalAmount: sale.totalAmount, paymentMethod: sale.paymentMethod },
  });

  return sale;
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
