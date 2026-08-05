import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSupplier, updateSupplier, listSuppliers, getSupplier } from "@/lib/compta/supplier-service";
import { NotFoundError } from "@/lib/errors";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Compta Vellano — supplier-service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createOrgAndUser(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org compta supplier ${suffix}` } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `compta-supplier-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    return { organization, user };
  }

  it("crée, liste et met à jour un fournisseur, isolé par organisation", async () => {
    const { organization, user } = await createOrgAndUser("crud");
    const supplier = await createSupplier(organization.id, { name: "Metro", balanceDue: 0 }, user.id);

    const listed = await listSuppliers(organization.id);
    expect(listed.map((s) => s.id)).toContain(supplier.id);

    const updated = await updateSupplier(organization.id, supplier.id, { balanceDue: 15000 }, user.id);
    expect(updated.balanceDue).toBe(15000);

    const { organization: otherOrg } = await createOrgAndUser("crud-other");
    await expect(getSupplier(otherOrg.id, supplier.id)).rejects.toThrow(NotFoundError);
  });
});
