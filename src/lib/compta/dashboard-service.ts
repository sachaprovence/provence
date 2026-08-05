import "server-only";
import { prisma } from "@/lib/prisma";
import { extractVatFromTtc } from "@/lib/compta/money";
import { listTopSellingProducts } from "@/lib/compta/sale-service";
import { listLowStockIngredients } from "@/lib/compta/stock-service";
import { ComptaSaleStatus } from "@/generated/prisma/enums";

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Lundi 00:00 de la semaine en cours. */
function startOfIsoWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 = dimanche
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

const NOT_CANCELLED = { not: ComptaSaleStatus.CANCELLED } as const;

export async function getComptaDashboard(organizationId: string) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = startOfIsoWeek(now);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const start14DaysAgo = new Date(startOfToday);
  start14DaysAgo.setDate(start14DaysAgo.getDate() - 13);
  const since30Days = new Date(startOfToday);
  since30Days.setDate(since30Days.getDate() - 29);

  const [
    salesToday,
    salesWeek,
    salesMonth,
    expensesMonth,
    salesLast14Days,
    lastSales,
    lastExpenses,
    latestCashCount,
    topProducts,
    lowStockIngredients,
    suppliersWithBalance,
    lastClosedCashSession,
    monthLines,
    categoryLines,
  ] = await Promise.all([
    prisma.comptaSale.aggregate({
      where: { organizationId, soldAt: { gte: startOfToday }, status: NOT_CANCELLED },
      _sum: { totalAmount: true },
    }),
    prisma.comptaSale.aggregate({
      where: { organizationId, soldAt: { gte: startOfWeek }, status: NOT_CANCELLED },
      _sum: { totalAmount: true },
    }),
    prisma.comptaSale.findMany({
      where: { organizationId, soldAt: { gte: startOfMonth, lt: startOfNextMonth }, status: NOT_CANCELLED },
      select: { totalAmount: true, vatAmount: true },
    }),
    prisma.comptaExpense.findMany({
      where: { organizationId, spentAt: { gte: startOfMonth, lt: startOfNextMonth } },
      select: { amount: true, vatAmount: true },
    }),
    prisma.comptaSale.findMany({
      where: { organizationId, soldAt: { gte: start14DaysAgo }, status: NOT_CANCELLED },
      select: { totalAmount: true, soldAt: true },
    }),
    prisma.comptaSale.findMany({ where: { organizationId, status: NOT_CANCELLED }, orderBy: { soldAt: "desc" }, take: 5 }),
    prisma.comptaExpense.findMany({ where: { organizationId }, orderBy: { spentAt: "desc" }, take: 5 }),
    prisma.comptaCashCount.findFirst({ where: { organizationId }, orderBy: { countedAt: "desc" } }),
    listTopSellingProducts(organizationId, { days: 30, limit: 5 }),
    listLowStockIngredients(organizationId),
    prisma.comptaSupplier.findMany({ where: { organizationId, balanceDue: { gt: 0 } } }),
    prisma.comptaCashSession.findFirst({ where: { organizationId, closedAt: { not: null } }, orderBy: { closedAt: "desc" } }),
    prisma.comptaSaleLine.findMany({
      where: { sale: { organizationId, soldAt: { gte: startOfMonth, lt: startOfNextMonth }, status: NOT_CANCELLED } },
      include: { product: { select: { costPrice: true } } },
    }),
    prisma.comptaSaleLine.findMany({
      where: { sale: { organizationId, soldAt: { gte: since30Days }, status: NOT_CANCELLED } },
      include: { product: { select: { category: true } } },
    }),
  ]);

  const caMonth = salesMonth.reduce((sum, sale) => sum + sale.totalAmount, 0);
  const vatCollectedMonth = salesMonth.reduce((sum, sale) => sum + sale.vatAmount, 0);
  const expensesMonthTotal = expensesMonth.reduce((sum, expense) => sum + expense.amount, 0);
  const vatDeductibleMonth = expensesMonth.reduce((sum, expense) => sum + expense.vatAmount, 0);

  // Bénéfice estimé HT : la TVA collectée/déductible n'est pas un revenu/coût réel de l'activité.
  const profitEstimate = caMonth - vatCollectedMonth - (expensesMonthTotal - vatDeductibleMonth);

  const byDay = new Map<string, number>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(start14DaysAgo);
    d.setDate(d.getDate() + i);
    byDay.set(dayKey(d), 0);
  }
  for (const sale of salesLast14Days) {
    const key = dayKey(sale.soldAt);
    byDay.set(key, (byDay.get(key) ?? 0) + sale.totalAmount);
  }
  const dailySales = Array.from(byDay.entries()).map(([date, total]) => ({ date, total }));

  const lastOperations = [
    ...lastSales.map((sale) => ({
      type: "sale" as const,
      id: sale.id,
      date: sale.soldAt,
      amount: sale.totalAmount,
      label: sale.paymentMethod,
    })),
    ...lastExpenses.map((expense) => ({
      type: "expense" as const,
      id: expense.id,
      date: expense.spentAt,
      amount: -expense.amount,
      label: expense.description,
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 8);

  // Marge (HT) : seules les lignes dont le produit a un coût matière connu sont prises en compte
  // — on ne devine jamais un coût, une marge partielle affichée honnêtement vaut mieux qu'un
  // chiffre inventé.
  let marginAmount = 0;
  let costKnownRevenueHT = 0;
  for (const line of monthLines) {
    if (line.product?.costPrice == null) continue;
    const lineVat = extractVatFromTtc(line.lineTotal, line.vatRate);
    const lineHT = line.lineTotal - lineVat;
    costKnownRevenueHT += lineHT;
    marginAmount += lineHT - line.product.costPrice * line.quantity;
  }
  const marginPercent = costKnownRevenueHT > 0 ? (marginAmount / costKnownRevenueHT) * 100 : null;

  const categoryTotals = new Map<string, number>();
  for (const line of categoryLines) {
    const category = line.product?.category ?? "Autre";
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + line.lineTotal);
  }
  const topCategories = Array.from(categoryTotals.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const alerts: { type: string; message: string }[] = [];
  if (lowStockIngredients.length > 0) {
    alerts.push({
      type: "low_stock",
      message: `${lowStockIngredients.length} ingrédient${lowStockIngredients.length > 1 ? "s" : ""} en stock faible.`,
    });
  }
  if (suppliersWithBalance.length > 0) {
    alerts.push({
      type: "supplier_balance",
      message: `${suppliersWithBalance.length} fournisseur${suppliersWithBalance.length > 1 ? "s" : ""} avec un solde impayé.`,
    });
  }
  if (lastClosedCashSession && Math.abs(lastClosedCashSession.differenceAmount ?? 0) >= 500) {
    alerts.push({ type: "cash_discrepancy", message: "Écart de caisse important détecté à la dernière fermeture." });
  }

  return {
    caToday: salesToday._sum.totalAmount ?? 0,
    caWeek: salesWeek._sum.totalAmount ?? 0,
    caMonth,
    expensesMonth: expensesMonthTotal,
    profitEstimate,
    marginAmount,
    marginPercent,
    vatDueMonth: vatCollectedMonth - vatDeductibleMonth,
    cashBalance: latestCashCount?.countedAmount ?? null,
    dailySales,
    lastOperations,
    topProducts,
    topCategories,
    lowStockIngredients,
    alerts,
  };
}
