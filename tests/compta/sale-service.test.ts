import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSale, listSales, getSale, deleteSale } from "@/lib/compta/sale-service";
import { NotFoundError } from "@/lib/errors";

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
});
