import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSale } from "@/lib/compta/sale-service";
import { createExpense } from "@/lib/compta/expense-service";
import { getVatSummary } from "@/lib/compta/vat-service";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Compta Vellano — vat-service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("agrège la TVA collectée/déductible sur un mois, en excluant les opérations hors période", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org compta vat" } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `compta-vat-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);

    // Vente dans le mois cible (mars 2026).
    await createSale(
      organization.id,
      {
        soldAt: new Date(2026, 2, 15),
        paymentMethod: "CASH",
        discountPercent: 0,
        lines: [{ productName: "Pizza", quantity: 1, unitPrice: 1000, vatRate: 10 }],
      },
      user.id
    );
    // Vente hors période (avril 2026) — ne doit pas être comptée.
    await createSale(
      organization.id,
      {
        soldAt: new Date(2026, 3, 1),
        paymentMethod: "CASH",
        discountPercent: 0,
        lines: [{ productName: "Pizza", quantity: 1, unitPrice: 1000, vatRate: 10 }],
      },
      user.id
    );

    // Dépense dans le mois cible.
    await createExpense(
      organization.id,
      { spentAt: new Date(2026, 2, 10), amount: 2000, vatRate: 20, category: "INGREDIENTS", description: "Fournitures" },
      user.id
    );

    const summary = await getVatSummary(organization.id, { year: 2026, month: 3 });

    expect(summary.collected).toBe(91); // 10,00 € TTC à 10% -> 0,909... -> 0,91 €
    expect(summary.deductible).toBe(333); // 20,00 € TTC à 20% -> 3,333... -> 3,33 €
    expect(summary.due).toBe(summary.collected - summary.deductible);
  });
});
