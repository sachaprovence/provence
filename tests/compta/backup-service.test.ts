import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createProduct } from "@/lib/compta/product-service";
import { createSale, listSales } from "@/lib/compta/sale-service";
import { createExpense } from "@/lib/compta/expense-service";
import { createSupplier } from "@/lib/compta/supplier-service";
import { createIngredient, setRecipe, getRecipe } from "@/lib/compta/stock-service";
import { exportOrganizationData, importOrganizationData, listComptaActivityLog } from "@/lib/compta/backup-service";
import { ValidationError } from "@/lib/errors";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Compta Vellano — backup-service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createOrgAndUser(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org compta backup ${suffix}` } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `compta-backup-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    return { organization, user };
  }

  it("exporte puis restaure les données d'une organisation, y compris les recettes (round-trip via JSON)", async () => {
    const { organization, user } = await createOrgAndUser("roundtrip");
    const product = await createProduct(organization.id, { name: "Margherita", category: "Pizza", price: 950, vatRate: 10, aliases: [], isActive: true, isFavorite: false }, user.id);
    const ingredient = await createIngredient(organization.id, { name: "Pâte", unit: "unité", stockQuantity: 10 }, user.id);
    await setRecipe(organization.id, product.id, [{ ingredientId: ingredient.id, quantity: 1 }], user.id);
    await createSale(organization.id, { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productId: product.id, productName: product.name, quantity: 2, unitPrice: 950, vatRate: 10 }] }, user.id);
    await createExpense(organization.id, { spentAt: new Date(), amount: 2500, vatRate: 20, category: "INGREDIENTS", description: "Farine" }, user.id);
    const supplier = await createSupplier(organization.id, { name: "Metro", balanceDue: 5000 }, user.id);

    const exported = await exportOrganizationData(organization.id);
    // Simule le passage par une route API (sérialisation/désérialisation JSON réelle, pas juste l'objet JS en mémoire).
    const roundTripped = JSON.parse(JSON.stringify(exported));

    // On efface tout, puis on restaure depuis la sauvegarde exportée.
    await prisma.comptaSale.deleteMany({ where: { organizationId: organization.id } });
    await prisma.comptaProduct.deleteMany({ where: { organizationId: organization.id } });
    await prisma.comptaExpense.deleteMany({ where: { organizationId: organization.id } });
    await prisma.comptaSupplier.deleteMany({ where: { organizationId: organization.id } });
    await prisma.comptaIngredient.deleteMany({ where: { organizationId: organization.id } });

    await importOrganizationData(organization.id, roundTripped, user.id);

    const sales = await listSales(organization.id);
    expect(sales).toHaveLength(1);
    expect(sales[0].lines[0].productName).toBe("Margherita");
    expect(sales[0].totalAmount).toBe(1900);

    const restoredProduct = await prisma.comptaProduct.findFirstOrThrow({ where: { organizationId: organization.id } });
    expect(restoredProduct.id).toBe(product.id);

    const restoredRecipe = await getRecipe(organization.id, product.id);
    expect(restoredRecipe).toHaveLength(1);
    expect(restoredRecipe[0].ingredientId).toBe(ingredient.id);

    const restoredSupplier = await prisma.comptaSupplier.findFirstOrThrow({ where: { organizationId: organization.id } });
    expect(restoredSupplier.balanceDue).toBe(5000);
    expect(supplier.id).toBe(restoredSupplier.id);
  });

  it("rejette l'import d'une sauvegarde appartenant à une autre organisation", async () => {
    const { organization: orgA } = await createOrgAndUser("cross-tenant-a");
    const { organization: orgB, user: userB } = await createOrgAndUser("cross-tenant-b");

    const exportedFromA = await exportOrganizationData(orgA.id);

    await expect(importOrganizationData(orgB.id, exportedFromA, userB.id)).rejects.toThrow(ValidationError);
  });

  it("rejette un fichier de sauvegarde mal formé", async () => {
    const { organization, user } = await createOrgAndUser("malformed");
    await expect(importOrganizationData(organization.id, { organizationId: organization.id }, user.id)).rejects.toThrow(ValidationError);
    await expect(importOrganizationData(organization.id, null, user.id)).rejects.toThrow(ValidationError);
  });

  it("journalise chaque action Compta et l'expose via l'historique, filtré par organisation", async () => {
    const { organization, user } = await createOrgAndUser("activity-log");
    await createProduct(organization.id, { name: "X", category: "Y", price: 100, vatRate: 10, aliases: [], isActive: true, isFavorite: false }, user.id);

    const log = await listComptaActivityLog(organization.id);
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((entry) => entry.action.startsWith("compta_"))).toBe(true);
    expect(log[0].user?.id).toBe(user.id);
  });
});
