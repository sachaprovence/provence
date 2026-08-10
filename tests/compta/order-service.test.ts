import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createProduct } from "@/lib/compta/product-service";
import { createIngredient, setRecipe, getIngredient } from "@/lib/compta/stock-service";
import {
  createOrder,
  getOrder,
  renameOrder,
  addOrderItem,
  updateOrderItemQuantity,
  removeOrderItem,
  cancelOrder,
  checkoutOrder,
  listOpenOrders,
  listOrderHistory,
  orderDisplayName,
} from "@/lib/compta/order-service";
import { NotFoundError, ConflictError, ValidationError } from "@/lib/errors";

/**
 * Commandes clients ("Commandes", Service Flow) : cycle de vie complet, incrément par clic
 * répété, snapshots figés, encaissement via sale-service (jamais une logique dupliquée),
 * protection contre le double-clic, isolation multi-tenant.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Compta Vellano — order-service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createOrgAndUser(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org compta order ${suffix}` } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `compta-order-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    return { organization, user };
  }

  it("crée une commande avec un nom fourni, ou un nom généré si absent", async () => {
    const { organization, user } = await createOrgAndUser("create");

    const named = await createOrder(organization.id, null, "Table 3", user.id);
    expect(named.name).toBe("Table 3");
    expect(orderDisplayName(named)).toBe("Table 3");

    const unnamed = await createOrder(organization.id, null, undefined, user.id);
    expect(unnamed.name).toBeNull();
    expect(orderDisplayName(unnamed)).toBe(`Commande #${unnamed.number}`);
    expect(unnamed.number).toBe(named.number + 1); // numérotation séquentielle par organisation
    expect(unnamed.status).toBe("OPEN");
  });

  it("renomme une commande ouverte", async () => {
    const { organization, user } = await createOrgAndUser("rename");
    const order = await createOrder(organization.id, null, "Table 1", user.id);

    const renamed = await renameOrder(organization.id, order.id, "Terrasse 2", user.id);
    expect(renamed.name).toBe("Terrasse 2");
  });

  it("ajoute un produit : un second appel sur le même produit incrémente la ligne existante", async () => {
    const { organization, user } = await createOrgAndUser("add-item");
    const product = await createProduct(organization.id, { name: "Margherita", category: "Pizza", price: 1200, vatRate: 10, aliases: [], isActive: true, isFavorite: false }, user.id);
    const order = await createOrder(organization.id, null, "Table 2", user.id);

    await addOrderItem(organization.id, order.id, product.id, user.id);
    const afterSecond = await addOrderItem(organization.id, order.id, product.id, user.id);

    expect(afterSecond.lines).toHaveLength(1);
    expect(afterSecond.lines[0].quantity).toBe(2);
    expect(afterSecond.computedTotal).toBe(2400);
  });

  it("fige le prix et la TVA au moment de l'ajout — une modification du produit ensuite ne change jamais la ligne déjà posée", async () => {
    const { organization, user } = await createOrgAndUser("snapshot");
    const product = await createProduct(organization.id, { name: "Coca", category: "Boissons", price: 300, vatRate: 20, aliases: [], isActive: true, isFavorite: false }, user.id);
    const order = await createOrder(organization.id, null, null, user.id);
    await addOrderItem(organization.id, order.id, product.id, user.id);

    await prisma.comptaProduct.update({ where: { id: product.id }, data: { price: 500, vatRate: 5.5 } });

    const after = await getOrder(organization.id, order.id);
    expect(after.lines[0].unitPriceTtcSnapshot).toBe(300);
    expect(after.lines[0].vatRateSnapshot).toBe(20);
  });

  it("ajuste la quantité d'une ligne, et la supprime automatiquement si elle atteint 0", async () => {
    const { organization, user } = await createOrgAndUser("quantity");
    const product = await createProduct(organization.id, { name: "Tiramisu", category: "Desserts", price: 550, vatRate: 10, aliases: [], isActive: true, isFavorite: false }, user.id);
    const order = await createOrder(organization.id, null, null, user.id);
    const withItem = await addOrderItem(organization.id, order.id, product.id, user.id);
    const lineId = withItem.lines[0].id;

    const bumped = await updateOrderItemQuantity(organization.id, order.id, lineId, 5, user.id);
    expect(bumped.lines[0].quantity).toBe(5);

    const cleared = await updateOrderItemQuantity(organization.id, order.id, lineId, 0, user.id);
    expect(cleared.lines).toHaveLength(0);
  });

  it("retire une ligne explicitement", async () => {
    const { organization, user } = await createOrgAndUser("remove-item");
    const product = await createProduct(organization.id, { name: "Salade", category: "Entrées", price: 700, vatRate: 10, aliases: [], isActive: true, isFavorite: false }, user.id);
    const order = await createOrder(organization.id, null, null, user.id);
    const withItem = await addOrderItem(organization.id, order.id, product.id, user.id);

    const after = await removeOrderItem(organization.id, order.id, withItem.lines[0].id, user.id);
    expect(after.lines).toHaveLength(0);
  });

  it("calcule le total en mélangeant plusieurs taux de TVA", async () => {
    const { organization, user } = await createOrgAndUser("multi-vat");
    const pizza = await createProduct(organization.id, { name: "Reine", category: "Pizza", price: 1300, vatRate: 10, aliases: [], isActive: true, isFavorite: false }, user.id);
    const soda = await createProduct(organization.id, { name: "Soda", category: "Boissons", price: 300, vatRate: 20, aliases: [], isActive: true, isFavorite: false }, user.id);
    const order = await createOrder(organization.id, null, null, user.id);
    await addOrderItem(organization.id, order.id, pizza.id, user.id);
    const final = await addOrderItem(organization.id, order.id, soda.id, user.id);

    expect(final.computedTotal).toBe(1600);
    expect(final.computedVat).toBeGreaterThan(0);
  });

  it("interdit toute modification d'une commande qui n'est plus ouverte", async () => {
    const { organization, user } = await createOrgAndUser("closed-order");
    const product = await createProduct(organization.id, { name: "Menu", category: "Menus", price: 1500, vatRate: 10, aliases: [], isActive: true, isFavorite: false }, user.id);
    const order = await createOrder(organization.id, null, null, user.id);
    await addOrderItem(organization.id, order.id, product.id, user.id);
    await checkoutOrder(organization.id, order.id, { paymentMethod: "CASH" }, user.id);

    await expect(addOrderItem(organization.id, order.id, product.id, user.id)).rejects.toThrow(ConflictError);
  });

  it("encaisse une commande : crée une vente via sale-service, décrémente le stock (recette), passe à COMPLETED", async () => {
    const { organization, user } = await createOrgAndUser("checkout");
    const dough = await createIngredient(organization.id, { name: "Pâte", unit: "unité", stockQuantity: 10 }, user.id);
    const product = await createProduct(organization.id, { name: "Margherita", category: "Pizza", price: 1200, vatRate: 10, aliases: [], isActive: true, isFavorite: false }, user.id);
    await setRecipe(organization.id, product.id, [{ ingredientId: dough.id, quantity: 1 }], user.id);

    const order = await createOrder(organization.id, null, "Table 9", user.id);
    await addOrderItem(organization.id, order.id, product.id, user.id);
    await addOrderItem(organization.id, order.id, product.id, user.id); // quantité 2

    const { order: completed, sale } = await checkoutOrder(organization.id, order.id, { paymentMethod: "CARD" }, user.id);

    expect(completed.status).toBe("COMPLETED");
    expect(completed.saleId).toBe(sale.id);
    expect(completed.totalAmount).toBe(2400);
    expect(sale.paymentMethod).toBe("CARD");

    const doughAfter = await getIngredient(organization.id, dough.id);
    expect(doughAfter.stockQuantity).toBe(8); // 10 - 2*1, la recette a bien été appliquée à l'encaissement
  });

  it("refuse d'encaisser une commande vide", async () => {
    const { organization, user } = await createOrgAndUser("checkout-empty");
    const order = await createOrder(organization.id, null, null, user.id);
    await expect(checkoutOrder(organization.id, order.id, { paymentMethod: "CASH" }, user.id)).rejects.toThrow(ValidationError);
  });

  it("empêche l'encaissement en double (protection contre le double-clic)", async () => {
    const { organization, user } = await createOrgAndUser("checkout-twice");
    const product = await createProduct(organization.id, { name: "Pizza", category: "Pizza", price: 1000, vatRate: 10, aliases: [], isActive: true, isFavorite: false }, user.id);
    const order = await createOrder(organization.id, null, null, user.id);
    await addOrderItem(organization.id, order.id, product.id, user.id);

    await checkoutOrder(organization.id, order.id, { paymentMethod: "CASH" }, user.id);
    await expect(checkoutOrder(organization.id, order.id, { paymentMethod: "CASH" }, user.id)).rejects.toThrow(ConflictError);

    // Une seule vente doit avoir été créée pour cette commande.
    const sales = await prisma.comptaSale.count({ where: { organizationId: organization.id } });
    expect(sales).toBe(1);
  });

  it("annule une commande avant encaissement — elle reste consultable mais ne produit jamais de vente", async () => {
    const { organization, user } = await createOrgAndUser("cancel");
    const product = await createProduct(organization.id, { name: "Pizza", category: "Pizza", price: 900, vatRate: 10, aliases: [], isActive: true, isFavorite: false }, user.id);
    const order = await createOrder(organization.id, null, "À emporter", user.id);
    await addOrderItem(organization.id, order.id, product.id, user.id);

    const cancelled = await cancelOrder(organization.id, order.id, "Client parti", user.id);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.saleId).toBeNull();

    const sales = await prisma.comptaSale.count({ where: { organizationId: organization.id } });
    expect(sales).toBe(0);

    const openOrders = await listOpenOrders(organization.id);
    expect(openOrders.map((o) => o.id)).not.toContain(order.id);

    const history = await listOrderHistory(organization.id, { status: "CANCELLED" });
    expect(history.map((o) => o.id)).toContain(order.id);
  });

  it("liste les commandes en cours, isolées par organisation", async () => {
    const { organization: orgA, user: userA } = await createOrgAndUser("isolation-a");
    const { organization: orgB } = await createOrgAndUser("isolation-b");
    await createOrder(orgA.id, null, "Table A", userA.id);

    const openA = await listOpenOrders(orgA.id);
    const openB = await listOpenOrders(orgB.id);
    expect(openA).toHaveLength(1);
    expect(openB).toHaveLength(0);
  });

  it("refuse de résoudre une commande d'une autre organisation", async () => {
    const { organization: orgA, user: userA } = await createOrgAndUser("cross-tenant-a");
    const { organization: orgB } = await createOrgAndUser("cross-tenant-b");
    const order = await createOrder(orgA.id, null, "Table X", userA.id);

    await expect(getOrder(orgB.id, order.id)).rejects.toThrow(NotFoundError);
  });
});
