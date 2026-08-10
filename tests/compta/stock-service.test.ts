import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createProduct } from "@/lib/compta/product-service";
import { createSale } from "@/lib/compta/sale-service";
import {
  createIngredient,
  updateIngredient,
  correctStock,
  getIngredient,
  listIngredients,
  listLowStockIngredients,
  listStockMovements,
  setRecipe,
  getRecipe,
  deleteRecipe,
  receiveStockForPurchaseOrder,
} from "@/lib/compta/stock-service";
import { NotFoundError } from "@/lib/errors";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Compta Vellano — stock-service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createOrgAndUser(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org compta stock ${suffix}` } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `compta-stock-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    return { organization, user };
  }

  it("crée un ingrédient avec un stock initial et journalise le mouvement INITIAL", async () => {
    const { organization, user } = await createOrgAndUser("initial-stock");

    const ingredient = await createIngredient(organization.id, { name: "Farine", unit: "kg", stockQuantity: 10, lowStockThreshold: 2, unitCost: null }, user.id);
    expect(ingredient.stockQuantity).toBe(10);

    const movements = await listStockMovements(organization.id, ingredient.id);
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe("INITIAL");
    expect(movements[0].quantityDelta).toBe(10);
    expect(movements[0].resultingQuantity).toBe(10);
  });

  it("liste et récupère un ingrédient, isolé par organisation", async () => {
    const { organization, user } = await createOrgAndUser("list-get");
    const ingredient = await createIngredient(organization.id, { name: "Mozzarella", unit: "kg", stockQuantity: 5 }, user.id);

    const listed = await listIngredients(organization.id);
    expect(listed.map((i) => i.id)).toContain(ingredient.id);

    const { organization: otherOrg } = await createOrgAndUser("list-get-other");
    await expect(getIngredient(otherOrg.id, ingredient.id)).rejects.toThrow(NotFoundError);
  });

  it("corrige le stock vers une valeur constatée et journalise l'écart", async () => {
    const { organization, user } = await createOrgAndUser("correction");
    const ingredient = await createIngredient(organization.id, { name: "Jambon", unit: "kg", stockQuantity: 8 }, user.id);

    const corrected = await correctStock(organization.id, ingredient.id, 6, "Casse inventaire", user.id);
    expect(corrected.stockQuantity).toBe(6);

    const movements = await listStockMovements(organization.id, ingredient.id);
    const correction = movements.find((m) => m.type === "CORRECTION");
    expect(correction?.quantityDelta).toBe(-2);
    expect(correction?.reason).toBe("Casse inventaire");
  });

  it("autorise un stock négatif plutôt que de bloquer une opération", async () => {
    const { organization, user } = await createOrgAndUser("negative-stock");
    const ingredient = await createIngredient(organization.id, { name: "Champignons", unit: "kg", stockQuantity: 1 }, user.id);

    const corrected = await correctStock(organization.id, ingredient.id, -3, "Erreur de comptage constatée", user.id);
    expect(corrected.stockQuantity).toBe(-3);
  });

  it("alerte stock faible : uniquement les ingrédients sous leur seuil configuré", async () => {
    const { organization, user } = await createOrgAndUser("low-stock");
    const low = await createIngredient(organization.id, { name: "Basilic", unit: "kg", stockQuantity: 1, lowStockThreshold: 2 }, user.id);
    await createIngredient(organization.id, { name: "Sel", unit: "kg", stockQuantity: 50, lowStockThreshold: 5 }, user.id);
    await createIngredient(organization.id, { name: "Poivre", unit: "kg", stockQuantity: 0.1 }, user.id); // pas de seuil configuré

    const lowStock = await listLowStockIngredients(organization.id);
    expect(lowStock.map((i) => i.id)).toEqual([low.id]);
  });

  it("recette produit : décrémente automatiquement le stock des ingrédients à la vente", async () => {
    const { organization, user } = await createOrgAndUser("recipe-deduction");
    const dough = await createIngredient(organization.id, { name: "Pâte", unit: "unité", stockQuantity: 20 }, user.id);
    const cheese = await createIngredient(organization.id, { name: "Mozzarella", unit: "kg", stockQuantity: 5 }, user.id);
    const product = await createProduct(
      organization.id,
      { name: "Margherita", category: "Pizza", price: 950, vatRate: 10, aliases: [], isActive: true, isFavorite: false },
      user.id
    );

    await setRecipe(organization.id, product.id, [
      { ingredientId: dough.id, quantity: 1 },
      { ingredientId: cheese.id, quantity: 0.2 },
    ], user.id);

    const recipe = await getRecipe(organization.id, product.id);
    expect(recipe).toHaveLength(2);

    const sale = await createSale(
      organization.id,
      {
        soldAt: new Date(),
        paymentMethod: "CASH",
        discountPercent: 0,
        lines: [{ productId: product.id, productName: product.name, quantity: 3, unitPrice: 950, vatRate: 10 }],
      },
      user.id
    );
    expect(sale.id).toBeTruthy();

    const doughAfter = await getIngredient(organization.id, dough.id);
    const cheeseAfter = await getIngredient(organization.id, cheese.id);
    expect(doughAfter.stockQuantity).toBe(17); // 20 - 3*1
    expect(cheeseAfter.stockQuantity).toBeCloseTo(4.4); // 5 - 3*0.2
  });

  it("supprime intégralement la recette d'un produit sans supprimer le produit ni l'historique des ventes", async () => {
    const { organization, user } = await createOrgAndUser("recipe-delete");
    const dough = await createIngredient(organization.id, { name: "Pâte", unit: "unité", stockQuantity: 10 }, user.id);
    const product = await createProduct(
      organization.id,
      { name: "Reine", category: "Pizza", price: 1200, vatRate: 10, aliases: [], isActive: true, isFavorite: false },
      user.id
    );
    await setRecipe(organization.id, product.id, [{ ingredientId: dough.id, quantity: 1 }], user.id);
    expect(await getRecipe(organization.id, product.id)).toHaveLength(1);

    // Une vente réalisée avant la suppression doit rester consultable et inchangée après coup.
    const sale = await createSale(
      organization.id,
      { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productId: product.id, productName: product.name, quantity: 1, unitPrice: 1200, vatRate: 10 }] },
      user.id
    );

    await deleteRecipe(organization.id, product.id, user.id);

    expect(await getRecipe(organization.id, product.id)).toHaveLength(0);
    const productAfter = await prisma.comptaProduct.findUniqueOrThrow({ where: { id: product.id } });
    expect(productAfter.id).toBe(product.id); // le produit lui-même n'est jamais supprimé
    const saleAfter = await prisma.comptaSale.findUniqueOrThrow({ where: { id: sale.id }, include: { lines: true } });
    expect(saleAfter.lines[0].quantity).toBe(1); // l'historique de vente n'est jamais modifié rétroactivement
  });

  it("lève une erreur si on tente de supprimer une recette déjà vide", async () => {
    const { organization, user } = await createOrgAndUser("recipe-delete-empty");
    const product = await createProduct(
      organization.id,
      { name: "Sans recette", category: "Pizza", price: 1000, vatRate: 10, aliases: [], isActive: true, isFavorite: false },
      user.id
    );
    await expect(deleteRecipe(organization.id, product.id, user.id)).rejects.toThrow(NotFoundError);
  });

  it("réception de commande fournisseur : incrémente le stock des ingrédients commandés", async () => {
    const { organization, user } = await createOrgAndUser("purchase-reception");
    const flour = await createIngredient(organization.id, { name: "Farine", unit: "kg", stockQuantity: 10 }, user.id);

    await receiveStockForPurchaseOrder(organization.id, "fake-po-id", [{ ingredientId: flour.id, quantity: 25 }]);

    const after = await getIngredient(organization.id, flour.id);
    expect(after.stockQuantity).toBe(35);
  });

  it("met à jour un ingrédient sans passer par le stock (nom, seuil, coût unitaire)", async () => {
    const { organization, user } = await createOrgAndUser("update");
    const ingredient = await createIngredient(organization.id, { name: "Olives", unit: "kg", stockQuantity: 3 }, user.id);

    const updated = await updateIngredient(organization.id, ingredient.id, { lowStockThreshold: 1, unitCost: 450 }, user.id);
    expect(updated.lowStockThreshold).toBe(1);
    expect(updated.unitCost).toBe(450);
    expect(updated.stockQuantity).toBe(3); // inchangé
  });
});
