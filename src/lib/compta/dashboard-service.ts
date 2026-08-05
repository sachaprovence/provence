import "server-only";
import { prisma } from "@/lib/prisma";

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getComptaDashboard(organizationId: string) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const start14DaysAgo = new Date(startOfToday);
  start14DaysAgo.setDate(start14DaysAgo.getDate() - 13);

  const [salesToday, salesMonth, expensesMonth, salesLast14Days, lastSales, lastExpenses, latestCashCount] =
    await Promise.all([
      prisma.comptaSale.aggregate({
        where: { organizationId, soldAt: { gte: startOfToday } },
        _sum: { totalAmount: true },
      }),
      prisma.comptaSale.findMany({
        where: { organizationId, soldAt: { gte: startOfMonth, lt: startOfNextMonth } },
        select: { totalAmount: true, vatAmount: true },
      }),
      prisma.comptaExpense.findMany({
        where: { organizationId, spentAt: { gte: startOfMonth, lt: startOfNextMonth } },
        select: { amount: true, vatAmount: true },
      }),
      prisma.comptaSale.findMany({
        where: { organizationId, soldAt: { gte: start14DaysAgo } },
        select: { totalAmount: true, soldAt: true },
      }),
      prisma.comptaSale.findMany({ where: { organizationId }, orderBy: { soldAt: "desc" }, take: 5 }),
      prisma.comptaExpense.findMany({ where: { organizationId }, orderBy: { spentAt: "desc" }, take: 5 }),
      prisma.comptaCashCount.findFirst({ where: { organizationId }, orderBy: { countedAt: "desc" } }),
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

  return {
    caToday: salesToday._sum.totalAmount ?? 0,
    caMonth,
    expensesMonth: expensesMonthTotal,
    profitEstimate,
    vatDueMonth: vatCollectedMonth - vatDeductibleMonth,
    cashBalance: latestCashCount?.countedAmount ?? null,
    dailySales,
    lastOperations,
  };
}
