import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createCustomer, updateCustomer, getCustomer, listCustomers, accrueLoyaltyPoints } from "@/lib/compta/customer-service";
import { NotFoundError } from "@/lib/errors";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Compta Vellano — customer-service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createOrgAndUser(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org compta customer ${suffix}` } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `compta-customer-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    return { organization, user };
  }

  it("crée, liste et met à jour un client, isolé par organisation", async () => {
    const { organization, user } = await createOrgAndUser("crud");
    const customer = await createCustomer(organization.id, { name: "Jean Dupont", phone: "0600000000" }, user.id);

    const listed = await listCustomers(organization.id);
    expect(listed.map((c) => c.id)).toContain(customer.id);

    const updated = await updateCustomer(organization.id, customer.id, { notes: "Habitué du jeudi" }, user.id);
    expect(updated.notes).toBe("Habitué du jeudi");

    const { organization: otherOrg } = await createOrgAndUser("crud-other");
    await expect(getCustomer(otherOrg.id, customer.id)).rejects.toThrow(NotFoundError);
  });

  it("crédite 1 point de fidélité par euro TTC dépensé", async () => {
    const { organization, user } = await createOrgAndUser("loyalty");
    const customer = await createCustomer(organization.id, { name: "Marie Martin" }, user.id);

    await accrueLoyaltyPoints(organization.id, customer.id, 950); // 9,50€ -> 9 points
    const after = await getCustomer(organization.id, customer.id);
    expect(after.loyaltyPoints).toBe(9);

    await accrueLoyaltyPoints(organization.id, customer.id, 1050); // +10 points -> 19
    const afterSecond = await getCustomer(organization.id, customer.id);
    expect(afterSecond.loyaltyPoints).toBe(19);
  });

  it("ne fait jamais passer le solde de points sous zéro (remboursement)", async () => {
    const { organization, user } = await createOrgAndUser("loyalty-floor");
    const customer = await createCustomer(organization.id, { name: "Paul Petit" }, user.id);

    await accrueLoyaltyPoints(organization.id, customer.id, 500); // +5 points
    await accrueLoyaltyPoints(organization.id, customer.id, -2000); // -20 points, ne doit pas descendre sous 0

    const after = await getCustomer(organization.id, customer.id);
    expect(after.loyaltyPoints).toBe(0);
  });
});
