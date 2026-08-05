import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createExpense, updateExpense, deleteExpense, getExpense, listExpenses } from "@/lib/compta/expense-service";
import { NotFoundError } from "@/lib/errors";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Compta Vellano — expense-service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createOrgAndUser(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org compta expense ${suffix}` } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `compta-expense-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    return { organization, user };
  }

  it("calcule la TVA déductible à partir du montant TTC", async () => {
    const { organization, user } = await createOrgAndUser("vat-calc");

    const expense = await createExpense(
      organization.id,
      { spentAt: new Date(), amount: 2500, vatRate: 20, category: "INGREDIENTS", description: "Farine" },
      user.id
    );

    expect(expense.vatAmount).toBe(417); // 25,00 € TTC à 20% -> 4,1666... -> 4,17 €
  });

  it("recalcule la TVA récupérable lors d'une mise à jour du montant ou du taux", async () => {
    const { organization, user } = await createOrgAndUser("vat-recalc");
    const expense = await createExpense(
      organization.id,
      { spentAt: new Date(), amount: 1000, vatRate: 20, category: "OTHER", description: "Test" },
      user.id
    );
    expect(expense.vatAmount).toBe(167);

    const updated = await updateExpense(organization.id, expense.id, { vatRate: 10 }, user.id);
    expect(updated.vatAmount).toBe(91); // 10,00 € TTC à 10% -> 0,909... -> 0,91 €
  });

  it("isole les dépenses par organisation et rejette lecture/suppression cross-tenant", async () => {
    const { organization, user } = await createOrgAndUser("isolation");
    const created = await createExpense(
      organization.id,
      { spentAt: new Date(), amount: 500, vatRate: 20, category: "OTHER", description: "X" },
      user.id
    );

    const listed = await listExpenses(organization.id);
    expect(listed.map((e) => e.id)).toContain(created.id);

    const { organization: otherOrg } = await createOrgAndUser("isolation-other");
    await expect(getExpense(otherOrg.id, created.id)).rejects.toThrow(NotFoundError);
    await expect(deleteExpense(otherOrg.id, created.id, user.id)).rejects.toThrow(NotFoundError);

    await deleteExpense(organization.id, created.id, user.id);
    await expect(getExpense(organization.id, created.id)).rejects.toThrow(NotFoundError);
  });
});
