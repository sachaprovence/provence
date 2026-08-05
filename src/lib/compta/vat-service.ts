import "server-only";
import { prisma } from "@/lib/prisma";

export type ComptaVatPeriod = { year: number; month: number };

export type ComptaVatSummary = {
  period: ComptaVatPeriod;
  collected: number;
  deductible: number;
  due: number;
  salesTotal: number;
  expensesTotal: number;
};

/** TVA collectée (ventes) / déductible (dépenses) / à payer, pour un mois donné. */
export async function getVatSummary(organizationId: string, period: ComptaVatPeriod): Promise<ComptaVatSummary> {
  const start = new Date(period.year, period.month - 1, 1);
  const end = new Date(period.year, period.month, 1);

  const [sales, expenses] = await Promise.all([
    prisma.comptaSale.aggregate({
      where: { organizationId, soldAt: { gte: start, lt: end } },
      _sum: { vatAmount: true, totalAmount: true },
    }),
    prisma.comptaExpense.aggregate({
      where: { organizationId, spentAt: { gte: start, lt: end } },
      _sum: { vatAmount: true, amount: true },
    }),
  ]);

  const collected = sales._sum.vatAmount ?? 0;
  const deductible = expenses._sum.vatAmount ?? 0;

  return {
    period,
    collected,
    deductible,
    due: collected - deductible,
    salesTotal: sales._sum.totalAmount ?? 0,
    expensesTotal: expenses._sum.amount ?? 0,
  };
}

/** Vue annuelle, mois par mois — pour l'écran TVA. */
export async function getVatSummaryByYear(organizationId: string, year: number): Promise<ComptaVatSummary[]> {
  return Promise.all(
    Array.from({ length: 12 }, (_, index) => getVatSummary(organizationId, { year, month: index + 1 }))
  );
}
