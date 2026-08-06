import "server-only";
import { listSales } from "@/lib/compta/sale-service";
import { listExpenses } from "@/lib/compta/expense-service";
import { getVatSummaryByYear } from "@/lib/compta/vat-service";
import { formatEuros } from "@/lib/compta/money";
import { renderComptaTablePdf } from "@/lib/compta/pdf";

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Espèces",
  CARD: "Carte",
  TRANSFER: "Virement",
  MEAL_VOUCHER: "Ticket restaurant",
  CHEQUE: "Chèque",
  OTHER: "Autre",
};

const MONTH_LABEL = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/**
 * CSV avec `;` comme séparateur (pas `,`) — c'est le séparateur attendu par
 * Excel/LibreOffice en locale française (où `,` est le séparateur décimal),
 * sinon un fichier "CSV" s'ouvre en une seule colonne illisible.
 */
function csvCell(value: string | number): string {
  const str = String(value);
  return /[",;\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(csvCell).join(";"), ...rows.map((row) => row.map(csvCell).join(";"))];
  return `${lines.join("\r\n")}\r\n`;
}

export async function exportSalesCsv(organizationId: string, filters: { from?: Date; to?: Date } = {}): Promise<string> {
  const sales = await listSales(organizationId, { ...filters, includeCancelled: true });
  return toCsv(
    ["Référence", "Date", "Statut", "Mode de paiement", "Produits", "Total HT", "TVA", "Total TTC"],
    sales.map((sale) => [
      sale.reference ?? sale.id,
      sale.soldAt.toLocaleString("fr-FR"),
      sale.status,
      PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod,
      sale.lines.map((line) => `${line.quantity}x ${line.productName}`).join(", "),
      ((sale.totalAmount - sale.vatAmount) / 100).toFixed(2),
      (sale.vatAmount / 100).toFixed(2),
      (sale.totalAmount / 100).toFixed(2),
    ])
  );
}

export async function exportExpensesCsv(organizationId: string, filters: { from?: Date; to?: Date } = {}): Promise<string> {
  const expenses = await listExpenses(organizationId, filters);
  return toCsv(
    ["Date", "Catégorie", "Description", "Fournisseur", "Montant TTC", "TVA récupérable"],
    expenses.map((expense) => [
      expense.spentAt.toLocaleDateString("fr-FR"),
      expense.category,
      expense.description,
      expense.supplier?.name ?? "",
      (expense.amount / 100).toFixed(2),
      (expense.vatAmount / 100).toFixed(2),
    ])
  );
}

export async function exportVatJournalPdf(organizationId: string, year: number): Promise<Uint8Array> {
  const months = await getVatSummaryByYear(organizationId, year);
  const totals = months.reduce(
    (acc, m) => ({ collected: acc.collected + m.collected, deductible: acc.deductible + m.deductible, due: acc.due + m.due }),
    { collected: 0, deductible: 0, due: 0 }
  );

  return renderComptaTablePdf({
    title: `Journal TVA ${year}`,
    subtitle: "TVA collectée (ventes) / déductible (dépenses) / à payer, par mois",
    columns: [
      { header: "Mois", width: 150 },
      { header: "TVA collectée", width: 130, align: "right" },
      { header: "TVA déductible", width: 130, align: "right" },
      { header: "TVA à payer", width: 105, align: "right" },
    ],
    rows: months.map((m, index) => [
      MONTH_LABEL[index],
      formatEuros(m.collected),
      formatEuros(m.deductible),
      formatEuros(m.due),
    ]),
    totalsLine: `Total ${year} — Collectée : ${formatEuros(totals.collected)} · Déductible : ${formatEuros(totals.deductible)} · À payer : ${formatEuros(totals.due)}`,
  });
}

export async function exportSalesJournalPdf(
  organizationId: string,
  filters: { from?: Date; to?: Date } = {}
): Promise<Uint8Array> {
  const sales = await listSales(organizationId, { ...filters });
  const total = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);

  return renderComptaTablePdf({
    title: "Livre des recettes",
    subtitle: filters.from && filters.to
      ? `Du ${filters.from.toLocaleDateString("fr-FR")} au ${filters.to.toLocaleDateString("fr-FR")}`
      : undefined,
    columns: [
      { header: "Référence", width: 90 },
      { header: "Date", width: 110 },
      { header: "Paiement", width: 90 },
      { header: "Produits", width: 200 },
      { header: "Total TTC", width: 105, align: "right" },
    ],
    rows: sales.map((sale) => [
      sale.reference ?? sale.id.slice(0, 8),
      sale.soldAt.toLocaleDateString("fr-FR"),
      PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod,
      sale.lines.map((line) => line.productName).join(", ").slice(0, 40),
      formatEuros(sale.totalAmount),
    ]),
    totalsLine: `Total : ${formatEuros(total)}`,
  });
}

export async function exportExpensesJournalPdf(
  organizationId: string,
  filters: { from?: Date; to?: Date } = {}
): Promise<Uint8Array> {
  const expenses = await listExpenses(organizationId, filters);
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  return renderComptaTablePdf({
    title: "Livre des dépenses",
    subtitle: filters.from && filters.to
      ? `Du ${filters.from.toLocaleDateString("fr-FR")} au ${filters.to.toLocaleDateString("fr-FR")}`
      : undefined,
    columns: [
      { header: "Date", width: 90 },
      { header: "Catégorie", width: 110 },
      { header: "Description", width: 190 },
      { header: "Fournisseur", width: 105 },
      { header: "Montant TTC", width: 100, align: "right" },
    ],
    rows: expenses.map((expense) => [
      expense.spentAt.toLocaleDateString("fr-FR"),
      expense.category,
      expense.description.slice(0, 35),
      expense.supplier?.name ?? "—",
      formatEuros(expense.amount),
    ]),
    totalsLine: `Total : ${formatEuros(total)}`,
  });
}
