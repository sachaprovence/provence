import { afterAll, describe, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSale, listSales } from "@/lib/compta/sale-service";
import { createExpense, listExpenses } from "@/lib/compta/expense-service";
import { createProduct, listProducts } from "@/lib/compta/product-service";
import { createSupplier, listSuppliers } from "@/lib/compta/supplier-service";
import { expectNoCrossTenantLeak } from "../helpers/tenant-isolation";

/**
 * Isolation multi-tenant obligatoire pour toute nouvelle route (voir
 * DEVELOPMENT_GUIDE.md §5, `tests/helpers/tenant-isolation.ts`) — appliquée
 * ici aux quatre listes Compta Vellano (ventes, dépenses, produits,
 * fournisseurs), chacune filtrée par `organizationId`.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Compta Vellano — isolation multi-tenant", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createOrgAndUser(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org compta isolation ${suffix}` } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `compta-isolation-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    return { organization, user };
  }

  it("ventes : chaque organisation ne voit que ses propres ventes", async () => {
    const { organization: orgA, user: userA } = await createOrgAndUser("sales-a");
    const { organization: orgB, user: userB } = await createOrgAndUser("sales-b");

    const saleA = await createSale(
      orgA.id,
      { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productName: "X", quantity: 1, unitPrice: 500, vatRate: 10 }] },
      userA.id
    );
    const saleB = await createSale(
      orgB.id,
      { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productName: "Y", quantity: 1, unitPrice: 500, vatRate: 10 }] },
      userB.id
    );

    await expectNoCrossTenantLeak({
      actorAItems: () => listSales(orgA.id),
      actorBItems: () => listSales(orgB.id),
      actorAOwnResourceId: saleA.id,
      actorBOwnResourceId: saleB.id,
      getId: (item) => item.id,
    });
  });

  it("dépenses : chaque organisation ne voit que ses propres dépenses", async () => {
    const { organization: orgA, user: userA } = await createOrgAndUser("expenses-a");
    const { organization: orgB, user: userB } = await createOrgAndUser("expenses-b");

    const expenseA = await createExpense(
      orgA.id,
      { spentAt: new Date(), amount: 500, vatRate: 20, category: "OTHER", description: "A" },
      userA.id
    );
    const expenseB = await createExpense(
      orgB.id,
      { spentAt: new Date(), amount: 500, vatRate: 20, category: "OTHER", description: "B" },
      userB.id
    );

    await expectNoCrossTenantLeak({
      actorAItems: () => listExpenses(orgA.id),
      actorBItems: () => listExpenses(orgB.id),
      actorAOwnResourceId: expenseA.id,
      actorBOwnResourceId: expenseB.id,
      getId: (item) => item.id,
    });
  });

  it("produits : chaque organisation ne voit que ses propres produits", async () => {
    const { organization: orgA, user: userA } = await createOrgAndUser("products-a");
    const { organization: orgB, user: userB } = await createOrgAndUser("products-b");

    const productA = await createProduct(orgA.id, { name: "A", category: "Pizza", price: 500, vatRate: 10, aliases: [], isActive: true }, userA.id);
    const productB = await createProduct(orgB.id, { name: "B", category: "Pizza", price: 500, vatRate: 10, aliases: [], isActive: true }, userB.id);

    await expectNoCrossTenantLeak({
      actorAItems: () => listProducts(orgA.id),
      actorBItems: () => listProducts(orgB.id),
      actorAOwnResourceId: productA.id,
      actorBOwnResourceId: productB.id,
      getId: (item) => item.id,
    });
  });

  it("fournisseurs : chaque organisation ne voit que ses propres fournisseurs", async () => {
    const { organization: orgA, user: userA } = await createOrgAndUser("suppliers-a");
    const { organization: orgB, user: userB } = await createOrgAndUser("suppliers-b");

    const supplierA = await createSupplier(orgA.id, { name: "A", balanceDue: 0 }, userA.id);
    const supplierB = await createSupplier(orgB.id, { name: "B", balanceDue: 0 }, userB.id);

    await expectNoCrossTenantLeak({
      actorAItems: () => listSuppliers(orgA.id),
      actorBItems: () => listSuppliers(orgB.id),
      actorAOwnResourceId: supplierA.id,
      actorBOwnResourceId: supplierB.id,
      getId: (item) => item.id,
    });
  });
});
