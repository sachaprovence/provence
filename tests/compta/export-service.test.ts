import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSale } from "@/lib/compta/sale-service";
import { createExpense } from "@/lib/compta/expense-service";
import {
  exportSalesCsv,
  exportExpensesCsv,
  exportVatJournalPdf,
  exportSalesJournalPdf,
  exportExpensesJournalPdf,
} from "@/lib/compta/export-service";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Compta Vellano — export-service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createOrgAndUser(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org compta export ${suffix}` } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `compta-export-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    return { organization, user };
  }

  it("exporte les ventes en CSV séparé par point-virgule, avec en-têtes fr-FR", async () => {
    const { organization, user } = await createOrgAndUser("sales-csv");
    await createSale(
      organization.id,
      { soldAt: new Date(2026, 5, 1), paymentMethod: "CASH", discountPercent: 0, lines: [{ productName: "Margherita", quantity: 1, unitPrice: 950, vatRate: 10 }] },
      user.id
    );

    const csv = await exportSalesCsv(organization.id);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Référence;Date;Statut;Mode de paiement;Produits;Total HT;TVA;Total TTC");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Margherita");
    expect(lines[1]).toContain("9.50");
  });

  it("échappe les valeurs contenant un point-virgule ou des guillemets dans le CSV", async () => {
    const { organization, user } = await createOrgAndUser("csv-escaping");
    await createExpense(
      organization.id,
      { spentAt: new Date(), amount: 1000, vatRate: 20, category: "OTHER", description: 'Fournitures "spéciales"; urgent' },
      user.id
    );

    const csv = await exportExpensesCsv(organization.id);
    expect(csv).toContain('"Fournitures ""spéciales""; urgent"');
  });

  it("génère un PDF valide pour le journal TVA annuel", async () => {
    const { organization, user } = await createOrgAndUser("vat-pdf");
    await createSale(
      organization.id,
      { soldAt: new Date(2026, 2, 10), paymentMethod: "CASH", discountPercent: 0, lines: [{ productName: "X", quantity: 1, unitPrice: 1000, vatRate: 10 }] },
      user.id
    );

    const pdfBytes = await exportVatJournalPdf(organization.id, 2026);
    expect(pdfBytes.length).toBeGreaterThan(100);
    expect(Buffer.from(pdfBytes.slice(0, 5)).toString("utf-8")).toBe("%PDF-");
  });

  it("génère un PDF valide pour le livre des recettes", async () => {
    const { organization, user } = await createOrgAndUser("sales-pdf");
    await createSale(
      organization.id,
      { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productName: "Margherita", quantity: 2, unitPrice: 950, vatRate: 10 }] },
      user.id
    );

    const pdfBytes = await exportSalesJournalPdf(organization.id);
    expect(pdfBytes.length).toBeGreaterThan(100);
    expect(Buffer.from(pdfBytes.slice(0, 5)).toString("utf-8")).toBe("%PDF-");
  });

  it("génère un PDF valide pour le livre des dépenses", async () => {
    const { organization, user } = await createOrgAndUser("expenses-pdf");
    await createExpense(organization.id, { spentAt: new Date(), amount: 2500, vatRate: 20, category: "INGREDIENTS", description: "Farine" }, user.id);

    const pdfBytes = await exportExpensesJournalPdf(organization.id);
    expect(pdfBytes.length).toBeGreaterThan(100);
    expect(Buffer.from(pdfBytes.slice(0, 5)).toString("utf-8")).toBe("%PDF-");
  });

  it("génère un PDF valide même sans aucune donnée (journal vide)", async () => {
    const { organization } = await createOrgAndUser("empty-pdf");
    const pdfBytes = await exportVatJournalPdf(organization.id, 2026);
    expect(Buffer.from(pdfBytes.slice(0, 5)).toString("utf-8")).toBe("%PDF-");
  });
});
