import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSale, cancelSale } from "@/lib/compta/sale-service";
import { createProduct } from "@/lib/compta/product-service";
import { createIngredient } from "@/lib/compta/stock-service";
import { createSupplier } from "@/lib/compta/supplier-service";
import { getComptaDashboard } from "@/lib/compta/dashboard-service";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Compta Vellano — dashboard-service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createOrgAndUser(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org compta dashboard ${suffix}` } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `compta-dashboard-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    return { organization, user };
  }

  it("exclut les ventes annulées du CA du jour et de la semaine, garde les ventes complétées", async () => {
    const { organization, user } = await createOrgAndUser("cancelled-excluded");
    const sale = await createSale(
      organization.id,
      { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productName: "X", quantity: 1, unitPrice: 1000, vatRate: 10 }] },
      user.id
    );
    await createSale(
      organization.id,
      { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productName: "Y", quantity: 1, unitPrice: 500, vatRate: 10 }] },
      user.id
    );
    const toCancel = await createSale(
      organization.id,
      { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productName: "Z", quantity: 1, unitPrice: 9999, vatRate: 10 }] },
      user.id
    );
    await cancelSale(organization.id, toCancel.id, undefined, user.id);

    const dashboard = await getComptaDashboard(organization.id);
    expect(dashboard.caToday).toBe(1500);
    expect(dashboard.caWeek).toBeGreaterThanOrEqual(1500);
    expect(sale.totalAmount).toBe(1000);
  });

  it("calcule la marge uniquement sur les produits avec un coût matière connu", async () => {
    const { organization, user } = await createOrgAndUser("margin");
    const known = await createProduct(
      organization.id,
      { name: "Margherita", category: "Pizza", price: 1000, vatRate: 10, costPrice: 300, aliases: [], isActive: true, isFavorite: false },
      user.id
    );
    const unknown = await createProduct(
      organization.id,
      { name: "Spéciale du jour", category: "Pizza", price: 1200, vatRate: 10, aliases: [], isActive: true, isFavorite: false },
      user.id
    );

    await createSale(organization.id, { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productId: known.id, productName: known.name, quantity: 1, unitPrice: 1000, vatRate: 10 }] }, user.id);
    await createSale(organization.id, { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productId: unknown.id, productName: unknown.name, quantity: 1, unitPrice: 1200, vatRate: 10 }] }, user.id);

    const dashboard = await getComptaDashboard(organization.id);
    // HT du produit connu : 1000 - extractVat(1000,10) = 1000 - 91 = 909. Marge = 909 - 300 = 609.
    expect(dashboard.marginAmount).toBe(609);
    expect(dashboard.marginPercent).not.toBeNull();
    expect(unknown.costPrice).toBeNull();
  });

  it("agrège le top produits et le top catégories sur 30 jours", async () => {
    const { organization, user } = await createOrgAndUser("top");
    const pizza = await createProduct(organization.id, { name: "Reine", category: "Pizza", price: 1200, vatRate: 10, aliases: [], isActive: true, isFavorite: false }, user.id);
    const drink = await createProduct(organization.id, { name: "Coca", category: "Boisson", price: 300, vatRate: 20, aliases: [], isActive: true, isFavorite: false }, user.id);

    await createSale(organization.id, { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productId: pizza.id, productName: pizza.name, quantity: 4, unitPrice: 1200, vatRate: 10 }] }, user.id);
    await createSale(organization.id, { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productId: drink.id, productName: drink.name, quantity: 1, unitPrice: 300, vatRate: 20 }] }, user.id);

    const dashboard = await getComptaDashboard(organization.id);
    expect(dashboard.topProducts[0].product.id).toBe(pizza.id);
    expect(dashboard.topCategories[0].category).toBe("Pizza");
  });

  it("remonte les alertes stock faible et solde fournisseur impayé", async () => {
    const { organization, user } = await createOrgAndUser("alerts");
    await createIngredient(organization.id, { name: "Farine", unit: "kg", stockQuantity: 1, lowStockThreshold: 5 }, user.id);
    const supplier = await createSupplier(organization.id, { name: "Metro", balanceDue: 0 }, user.id);
    await prisma.comptaSupplier.update({ where: { id: supplier.id }, data: { balanceDue: 15000 } });

    const dashboard = await getComptaDashboard(organization.id);
    expect(dashboard.alerts.some((a) => a.type === "low_stock")).toBe(true);
    expect(dashboard.alerts.some((a) => a.type === "supplier_balance")).toBe(true);
    expect(dashboard.lowStockIngredients).toHaveLength(1);
  });

  it("dashboard vide : aucune erreur, valeurs à zéro/vides", async () => {
    const { organization } = await createOrgAndUser("empty");
    const dashboard = await getComptaDashboard(organization.id);

    expect(dashboard.caToday).toBe(0);
    expect(dashboard.caWeek).toBe(0);
    expect(dashboard.marginAmount).toBe(0);
    expect(dashboard.marginPercent).toBeNull();
    expect(dashboard.topProducts).toEqual([]);
    expect(dashboard.alerts).toEqual([]);
  });
});
