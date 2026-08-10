import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createProduct, updateProduct } from "@/lib/compta/product-service";
import { createSale } from "@/lib/compta/sale-service";
import { createOrder, addOrderItem, checkoutOrder } from "@/lib/compta/order-service";
import { listVatRates, getVatRate, createVatRate, updateVatRate } from "@/lib/compta/vat-rate-service";
import { ConflictError, NotFoundError } from "@/lib/errors";

/**
 * TVA configurable : amorçage par défaut, création/modification/désactivation, affectation à un
 * produit, et — exigence critique — immutabilité des ventes déjà réalisées lorsqu'un taux est
 * modifié après coup (aussi bien via sale-service que via order-service/checkout).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Compta Vellano — vat-rate-service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createOrgAndUser(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org compta vat ${suffix}` } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `compta-vat-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    return { organization, user };
  }

  it("amorce les taux par défaut une seule fois — jamais recréés après suppression volontaire", async () => {
    const { organization } = await createOrgAndUser("seed");

    const first = await listVatRates(organization.id);
    expect(first.map((r) => r.rate).sort((a, b) => a - b)).toEqual([5.5, 10, 20]);

    await prisma.comptaVatRate.deleteMany({ where: { organizationId: organization.id } });

    const second = await listVatRates(organization.id);
    expect(second).toHaveLength(0); // pas de réamorçage après suppression volontaire
  });

  it("crée un taux, refuse un doublon de nom", async () => {
    const { organization, user } = await createOrgAndUser("create");
    const rate = await createVatRate(organization.id, { name: "TVA spéciale", rate: 2.1, isActive: true }, user.id);
    expect(rate.rate).toBe(2.1);

    await expect(createVatRate(organization.id, { name: "TVA spéciale", rate: 8, isActive: true }, user.id)).rejects.toThrow(ConflictError);
  });

  it("modifie le nom et désactive un taux sans toucher son pourcentage", async () => {
    const { organization, user } = await createOrgAndUser("update-basic");
    const rate = await createVatRate(organization.id, { name: "Temporaire", rate: 10, isActive: true }, user.id);

    const renamed = await updateVatRate(organization.id, rate.id, { name: "Renommé" }, user.id);
    expect(renamed.name).toBe("Renommé");
    expect(renamed.rate).toBe(10);

    const deactivated = await updateVatRate(organization.id, rate.id, { isActive: false }, user.id);
    expect(deactivated.isActive).toBe(false);

    const activeOnly = await listVatRates(organization.id, { activeOnly: true });
    expect(activeOnly.map((r) => r.id)).not.toContain(rate.id);
  });

  it("affecte un taux à un produit, puis synchronise le produit si le taux change — sans jamais retoucher une vente déjà enregistrée", async () => {
    const { organization, user } = await createOrgAndUser("assign-cascade");
    const vatRate = await createVatRate(organization.id, { name: "TVA réduite spéciale", rate: 5.5, isActive: true }, user.id);
    const product = await createProduct(
      organization.id,
      { name: "Salade", category: "Entrées", price: 800, vatRate: 5.5, vatRateId: vatRate.id, aliases: [], isActive: true, isFavorite: false },
      user.id
    );
    expect(product.vatRateId).toBe(vatRate.id);
    expect(product.vatRate).toBe(5.5);

    const sale = await createSale(
      organization.id,
      { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productId: product.id, productName: product.name, quantity: 1, unitPrice: 800, vatRate: product.vatRate }] },
      user.id
    );

    // Le taux catalogue passe de 5,5 % à 8 % : le produit lié doit suivre...
    await updateVatRate(organization.id, vatRate.id, { rate: 8 }, user.id);
    const productAfter = await prisma.comptaProduct.findUniqueOrThrow({ where: { id: product.id } });
    expect(productAfter.vatRate).toBe(8);

    // ...mais la vente déjà réalisée doit conserver son ancien taux, figé au moment de la vente.
    const saleAfter = await prisma.comptaSale.findUniqueOrThrow({ where: { id: sale.id }, include: { lines: true } });
    expect(saleAfter.lines[0].vatRate).toBe(5.5);
  });

  it("une modification de produit qui ne touche pas vatRateId ne modifie jamais le taux déjà affecté", async () => {
    const { organization, user } = await createOrgAndUser("update-product-no-vat-touch");
    const vatRate = await createVatRate(organization.id, { name: "TVA fixe", rate: 20, isActive: true }, user.id);
    const product = await createProduct(
      organization.id,
      { name: "Boisson", category: "Boissons", price: 300, vatRate: 20, vatRateId: vatRate.id, aliases: [], isActive: true, isFavorite: false },
      user.id
    );

    const updated = await updateProduct(organization.id, product.id, { price: 350 }, user.id);
    expect(updated.price).toBe(350);
    expect(updated.vatRateId).toBe(vatRate.id);
    expect(updated.vatRate).toBe(20);
  });

  it("immutabilité côté Commandes : encaisser une commande fige la TVA — une modification ultérieure du taux ne change jamais la vente issue de l'encaissement", async () => {
    const { organization, user } = await createOrgAndUser("order-checkout-immutability");
    const vatRate = await createVatRate(organization.id, { name: "TVA restauration bis", rate: 10, isActive: true }, user.id);
    const product = await createProduct(
      organization.id,
      { name: "Pizza", category: "Pizza", price: 1100, vatRate: 10, vatRateId: vatRate.id, aliases: [], isActive: true, isFavorite: false },
      user.id
    );

    const order = await createOrder(organization.id, null, "Table 5", user.id);
    await addOrderItem(organization.id, order.id, product.id, user.id);
    const { sale } = await checkoutOrder(organization.id, order.id, { paymentMethod: "CASH" }, user.id);

    await updateVatRate(organization.id, vatRate.id, { rate: 20 }, user.id);

    const saleAfter = await prisma.comptaSale.findUniqueOrThrow({ where: { id: sale.id }, include: { lines: true } });
    expect(saleAfter.lines[0].vatRate).toBe(10);
  });

  it("isole les taux de TVA par organisation", async () => {
    const { organization: orgA, user: userA } = await createOrgAndUser("isolation-a");
    const { organization: orgB } = await createOrgAndUser("isolation-b");
    const rate = await createVatRate(orgA.id, { name: "Taux privé A", rate: 12, isActive: true }, userA.id);

    await expect(getVatRate(orgB.id, rate.id)).rejects.toThrow(NotFoundError);
  });
});
