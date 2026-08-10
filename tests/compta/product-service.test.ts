import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createProduct, updateProduct, listProducts, getProduct } from "@/lib/compta/product-service";
import { NotFoundError } from "@/lib/errors";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Compta Vellano — product-service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createOrgAndUser(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org compta product ${suffix}` } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `compta-product-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    return { organization, user };
  }

  it("crée un produit et le retrouve par organisation", async () => {
    const { organization, user } = await createOrgAndUser("create");
    const product = await createProduct(
      organization.id,
      { name: "Margherita", category: "Pizza", price: 950, vatRate: 10, aliases: [], isActive: true, isFavorite: false },
      user.id
    );

    const fetched = await getProduct(organization.id, product.id);
    expect(fetched.name).toBe("Margherita");

    const { organization: otherOrg } = await createOrgAndUser("create-other");
    await expect(getProduct(otherOrg.id, product.id)).rejects.toThrow(NotFoundError);
  });

  it("exclut les produits inactifs de listProducts par défaut, les inclut avec includeInactive", async () => {
    const { organization, user } = await createOrgAndUser("inactive-filter");
    const product = await createProduct(
      organization.id,
      { name: "Ancienne pizza", category: "Pizza", price: 800, vatRate: 10, aliases: [], isActive: true, isFavorite: false },
      user.id
    );
    await updateProduct(organization.id, product.id, { isActive: false }, user.id);

    const activeOnly = await listProducts(organization.id);
    expect(activeOnly.map((p) => p.id)).not.toContain(product.id);

    const withInactive = await listProducts(organization.id, { includeInactive: true });
    expect(withInactive.map((p) => p.id)).toContain(product.id);
  });
});
