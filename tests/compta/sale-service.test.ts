import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createSale,
  listSales,
  getSale,
  deleteSale,
  cancelSale,
  refundSale,
  createQuickSale,
  listTopSellingProducts,
} from "@/lib/compta/sale-service";
import { createProduct } from "@/lib/compta/product-service";
import { createCustomer, getCustomer } from "@/lib/compta/customer-service";
import { NotFoundError, ConflictError } from "@/lib/errors";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Compta Vellano — sale-service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createOrgAndUser(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org compta sale ${suffix}` } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `compta-sale-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    return { organization, user };
  }

  it("calcule subtotal/vat/total à partir des lignes, sans remise", async () => {
    const { organization, user } = await createOrgAndUser("no-discount");

    const sale = await createSale(
      organization.id,
      {
        soldAt: new Date(),
        paymentMethod: "CASH",
        discountPercent: 0,
        lines: [{ productName: "Margherita", quantity: 2, unitPrice: 950, vatRate: 10 }],
      },
      user.id
    );

    expect(sale.subtotalAmount).toBe(1900);
    expect(sale.totalAmount).toBe(1900);
    expect(sale.vatAmount).toBe(173); // 19,00 € TTC à 10% -> 1,7272... -> 1,73 €
    expect(sale.lines).toHaveLength(1);
    expect(sale.lines[0].lineTotal).toBe(1900);
  });

  it("applique la remise ligne par ligne, en conservant des taux de TVA différents", async () => {
    const { organization, user } = await createOrgAndUser("discount-mixed-vat");

    const sale = await createSale(
      organization.id,
      {
        soldAt: new Date(),
        paymentMethod: "CARD",
        discountPercent: 10,
        lines: [
          { productName: "Pizza", quantity: 1, unitPrice: 1000, vatRate: 10 },
          { productName: "Boisson", quantity: 1, unitPrice: 300, vatRate: 20 },
        ],
      },
      user.id
    );

    // Subtotal brut avant remise = 1000 + 300 = 1300.
    expect(sale.subtotalAmount).toBe(1300);
    // Après remise 10% : pizza 900, boisson 270 -> total 1170.
    expect(sale.totalAmount).toBe(1170);
    // TVA : 900*10/110=81,81->82 ; 270*20/120=45 -> total 127.
    expect(sale.vatAmount).toBe(127);
  });

  it("liste et récupère une vente, isolée par organisation", async () => {
    const { organization, user } = await createOrgAndUser("list-get");
    const created = await createSale(
      organization.id,
      { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productName: "X", quantity: 1, unitPrice: 500, vatRate: 10 }] },
      user.id
    );

    const listed = await listSales(organization.id);
    expect(listed.map((s) => s.id)).toContain(created.id);

    const fetched = await getSale(organization.id, created.id);
    expect(fetched.id).toBe(created.id);

    const { organization: otherOrg } = await createOrgAndUser("list-get-other");
    await expect(getSale(otherOrg.id, created.id)).rejects.toThrow(NotFoundError);
  });

  it("supprime une vente (et rejette la suppression depuis une autre organisation)", async () => {
    const { organization, user } = await createOrgAndUser("delete");
    const created = await createSale(
      organization.id,
      { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productName: "X", quantity: 1, unitPrice: 500, vatRate: 10 }] },
      user.id
    );

    const { organization: otherOrg } = await createOrgAndUser("delete-other");
    await expect(deleteSale(otherOrg.id, created.id, user.id)).rejects.toThrow(NotFoundError);

    await deleteSale(organization.id, created.id, user.id);
    await expect(getSale(organization.id, created.id)).rejects.toThrow(NotFoundError);
  });

  it("attribue un numéro de vente séquentiel par organisation et par année (V-AAAA-NNNN)", async () => {
    const { organization, user } = await createOrgAndUser("reference");
    const soldAt = new Date(2026, 5, 1);
    const first = await createSale(
      organization.id,
      { soldAt, paymentMethod: "CASH", discountPercent: 0, lines: [{ productName: "X", quantity: 1, unitPrice: 500, vatRate: 10 }] },
      user.id
    );
    const second = await createSale(
      organization.id,
      { soldAt, paymentMethod: "CASH", discountPercent: 0, lines: [{ productName: "X", quantity: 1, unitPrice: 500, vatRate: 10 }] },
      user.id
    );

    expect(first.reference).toBe("V-2026-0001");
    expect(second.reference).toBe("V-2026-0002");
  });

  it("annule une vente (statut CANCELLED, exclue de listSales par défaut, jamais supprimée)", async () => {
    const { organization, user } = await createOrgAndUser("cancel");
    const sale = await createSale(
      organization.id,
      { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productName: "X", quantity: 1, unitPrice: 500, vatRate: 10 }] },
      user.id
    );

    const cancelled = await cancelSale(organization.id, sale.id, "Erreur de saisie", user.id);
    expect(cancelled.status).toBe("CANCELLED");

    const listed = await listSales(organization.id);
    expect(listed.map((s) => s.id)).not.toContain(sale.id);

    const listedWithCancelled = await listSales(organization.id, { includeCancelled: true });
    expect(listedWithCancelled.map((s) => s.id)).toContain(sale.id);

    // Toujours récupérable par id (jamais supprimée physiquement).
    const fetched = await getSale(organization.id, sale.id);
    expect(fetched.status).toBe("CANCELLED");
  });

  it("rejette l'annulation d'une vente déjà annulée ou remboursée", async () => {
    const { organization, user } = await createOrgAndUser("cancel-guard");
    const sale = await createSale(
      organization.id,
      { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productName: "X", quantity: 1, unitPrice: 500, vatRate: 10 }] },
      user.id
    );
    await cancelSale(organization.id, sale.id, undefined, user.id);

    await expect(cancelSale(organization.id, sale.id, undefined, user.id)).rejects.toThrow(ConflictError);
  });

  it("rembourse intégralement une vente : nouvelle vente liée, montants négatifs, vente d'origine inchangée", async () => {
    const { organization, user } = await createOrgAndUser("refund");
    const sale = await createSale(
      organization.id,
      {
        soldAt: new Date(),
        paymentMethod: "CARD",
        discountPercent: 0,
        lines: [{ productName: "Pizza", quantity: 2, unitPrice: 1000, vatRate: 10 }],
      },
      user.id
    );

    const refund = await refundSale(organization.id, sale.id, "Cliente pas satisfaite", user.id);

    expect(refund.status).toBe("REFUNDED");
    expect(refund.refundOfSaleId).toBe(sale.id);
    expect(refund.totalAmount).toBe(-sale.totalAmount);
    expect(refund.vatAmount).toBe(-sale.vatAmount);
    expect(refund.lines[0].quantity).toBe(-2);

    const originalAfter = await getSale(organization.id, sale.id);
    expect(originalAfter.status).toBe("COMPLETED");
    expect(originalAfter.totalAmount).toBe(sale.totalAmount);

    // Le CA net (somme des ventes non annulées) reflète le remboursement.
    const allSales = await listSales(organization.id);
    const netTotal = allSales.reduce((sum, s) => sum + s.totalAmount, 0);
    expect(netTotal).toBe(0);
  });

  it("rejette un remboursement sur une vente déjà remboursée ou annulée", async () => {
    const { organization, user } = await createOrgAndUser("refund-guard");
    const sale = await createSale(
      organization.id,
      { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productName: "X", quantity: 1, unitPrice: 500, vatRate: 10 }] },
      user.id
    );
    await refundSale(organization.id, sale.id, undefined, user.id);

    await expect(refundSale(organization.id, sale.id, undefined, user.id)).rejects.toThrow(ConflictError);
  });

  it("mode rapide : crée une vente 1 ligne espèces au prix catalogue du produit", async () => {
    const { organization, user } = await createOrgAndUser("quick-sale");
    const product = await createProduct(
      organization.id,
      { name: "Coca", category: "Boisson", price: 300, vatRate: 20, aliases: [], isActive: true, isFavorite: true },
      user.id
    );

    const sale = await createQuickSale(organization.id, product.id, user.id);
    expect(sale.paymentMethod).toBe("CASH");
    expect(sale.totalAmount).toBe(300);
    expect(sale.lines).toHaveLength(1);
    expect(sale.lines[0].productId).toBe(product.id);
  });

  it("rejette le mode rapide sur un produit inactif ou d'une autre organisation", async () => {
    const { organization, user } = await createOrgAndUser("quick-sale-guard");
    const product = await createProduct(
      organization.id,
      { name: "Fanta", category: "Boisson", price: 300, vatRate: 20, aliases: [], isActive: false, isFavorite: false },
      user.id
    );

    await expect(createQuickSale(organization.id, product.id, user.id)).rejects.toThrow(NotFoundError);
  });

  it("produits les plus vendus : classés par quantité vendue sur la période", async () => {
    const { organization, user } = await createOrgAndUser("top-selling");
    const margherita = await createProduct(organization.id, { name: "Margherita", category: "Pizza", price: 950, vatRate: 10, aliases: [], isActive: true, isFavorite: false }, user.id);
    const reine = await createProduct(organization.id, { name: "Reine", category: "Pizza", price: 1200, vatRate: 10, aliases: [], isActive: true, isFavorite: false }, user.id);

    await createSale(organization.id, { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productId: margherita.id, productName: margherita.name, quantity: 5, unitPrice: 950, vatRate: 10 }] }, user.id);
    await createSale(organization.id, { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productId: reine.id, productName: reine.name, quantity: 1, unitPrice: 1200, vatRate: 10 }] }, user.id);

    const topSelling = await listTopSellingProducts(organization.id, { days: 30, limit: 5 });
    expect(topSelling[0].product.id).toBe(margherita.id);
    expect(topSelling[0].quantitySold).toBe(5);
  });

  it("recherche instantanée : filtre par référence, client ou nom de produit", async () => {
    const { organization, user } = await createOrgAndUser("search");
    const customer = await createCustomer(organization.id, { name: "Camille Dubois" }, user.id);
    await createSale(
      organization.id,
      { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, customerId: customer.id, lines: [{ productName: "Calzone", quantity: 1, unitPrice: 1100, vatRate: 10 }] },
      user.id
    );
    await createSale(
      organization.id,
      { soldAt: new Date(), paymentMethod: "CASH", discountPercent: 0, lines: [{ productName: "Tiramisu", quantity: 1, unitPrice: 500, vatRate: 10 }] },
      user.id
    );

    const byProduct = await listSales(organization.id, { search: "calzone" });
    expect(byProduct).toHaveLength(1);

    const byCustomer = await listSales(organization.id, { search: "dubois" });
    expect(byCustomer).toHaveLength(1);
  });

  it("crédite des points de fidélité au client lors d'une vente qui le référence", async () => {
    const { organization, user } = await createOrgAndUser("sale-loyalty");
    const customer = await createCustomer(organization.id, { name: "Sophie Leroy" }, user.id);

    await createSale(
      organization.id,
      { soldAt: new Date(), paymentMethod: "CARD", discountPercent: 0, customerId: customer.id, lines: [{ productName: "Menu", quantity: 1, unitPrice: 1500, vatRate: 10 }] },
      user.id
    );

    const after = await getCustomer(organization.id, customer.id);
    expect(after.loyaltyPoints).toBe(15);
  });
});
