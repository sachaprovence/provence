import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSupplier } from "@/lib/compta/supplier-service";
import { createIngredient, getIngredient } from "@/lib/compta/stock-service";
import {
  createPurchaseOrder,
  markPurchaseOrderOrdered,
  receivePurchaseOrder,
  cancelPurchaseOrder,
  recordPurchasePayment,
  getPurchaseOrder,
  listPurchaseOrders,
  getSupplierPurchaseStats,
} from "@/lib/compta/purchase-service";
import { NotFoundError, ConflictError, ValidationError } from "@/lib/errors";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Compta Vellano — purchase-service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createOrgAndUser(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org compta purchase ${suffix}` } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `compta-purchase-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    return { organization, user };
  }

  it("crée une commande DRAFT avec le total calculé depuis les lignes", async () => {
    const { organization, user } = await createOrgAndUser("create");
    const supplier = await createSupplier(organization.id, { name: "Metro", balanceDue: 0 }, user.id);

    const order = await createPurchaseOrder(
      organization.id,
      { supplierId: supplier.id, lines: [{ label: "Farine 25kg", quantity: 4, unitCost: 1500 }] },
      user.id
    );

    expect(order.status).toBe("DRAFT");
    expect(order.totalAmount).toBe(6000);
    expect(order.lines).toHaveLength(1);
  });

  it("réception : incrémente le stock des ingrédients ET le solde dû du fournisseur", async () => {
    const { organization, user } = await createOrgAndUser("receive");
    const supplier = await createSupplier(organization.id, { name: "Metro", balanceDue: 0 }, user.id);
    const flour = await createIngredient(organization.id, { name: "Farine", unit: "kg", stockQuantity: 10 }, user.id);

    const order = await createPurchaseOrder(
      organization.id,
      { supplierId: supplier.id, lines: [{ ingredientId: flour.id, label: "Farine 25kg", quantity: 25, unitCost: 60 }] },
      user.id
    );

    const received = await receivePurchaseOrder(organization.id, order.id, user.id);
    expect(received.status).toBe("RECEIVED");

    const flourAfter = await getIngredient(organization.id, flour.id);
    expect(flourAfter.stockQuantity).toBe(35);

    const supplierAfter = await prisma.comptaSupplier.findUniqueOrThrow({ where: { id: supplier.id } });
    expect(supplierAfter.balanceDue).toBe(order.totalAmount);
  });

  it("rejette la réception d'une commande déjà réceptionnée ou annulée", async () => {
    const { organization, user } = await createOrgAndUser("receive-guard");
    const supplier = await createSupplier(organization.id, { name: "Metro", balanceDue: 0 }, user.id);
    const order = await createPurchaseOrder(organization.id, { supplierId: supplier.id, lines: [{ label: "X", quantity: 1, unitCost: 100 }] }, user.id);
    await receivePurchaseOrder(organization.id, order.id, user.id);

    await expect(receivePurchaseOrder(organization.id, order.id, user.id)).rejects.toThrow(ConflictError);

    const cancelledOrder = await createPurchaseOrder(organization.id, { supplierId: supplier.id, lines: [{ label: "Y", quantity: 1, unitCost: 100 }] }, user.id);
    await cancelPurchaseOrder(organization.id, cancelledOrder.id, user.id);
    await expect(receivePurchaseOrder(organization.id, cancelledOrder.id, user.id)).rejects.toThrow(ConflictError);
  });

  it("rejette l'annulation d'une commande déjà réceptionnée", async () => {
    const { organization, user } = await createOrgAndUser("cancel-guard");
    const supplier = await createSupplier(organization.id, { name: "Metro", balanceDue: 0 }, user.id);
    const order = await createPurchaseOrder(organization.id, { supplierId: supplier.id, lines: [{ label: "X", quantity: 1, unitCost: 100 }] }, user.id);
    await receivePurchaseOrder(organization.id, order.id, user.id);

    await expect(cancelPurchaseOrder(organization.id, order.id, user.id)).rejects.toThrow(ConflictError);
  });

  it("passe une commande de DRAFT à ORDERED, rejette un second passage", async () => {
    const { organization, user } = await createOrgAndUser("ordered");
    const supplier = await createSupplier(organization.id, { name: "Metro", balanceDue: 0 }, user.id);
    const order = await createPurchaseOrder(organization.id, { supplierId: supplier.id, lines: [{ label: "X", quantity: 1, unitCost: 100 }] }, user.id);

    const ordered = await markPurchaseOrderOrdered(organization.id, order.id, user.id);
    expect(ordered.status).toBe("ORDERED");
    expect(ordered.orderedAt).not.toBeNull();

    await expect(markPurchaseOrderOrdered(organization.id, order.id, user.id)).rejects.toThrow(ConflictError);
  });

  it("paiement partiel puis complet, rejette un paiement qui dépasse le total de la commande", async () => {
    const { organization, user } = await createOrgAndUser("payment");
    const supplier = await createSupplier(organization.id, { name: "Metro", balanceDue: 0 }, user.id);
    const order = await createPurchaseOrder(organization.id, { supplierId: supplier.id, lines: [{ label: "X", quantity: 1, unitCost: 10000 }] }, user.id);
    await receivePurchaseOrder(organization.id, order.id, user.id);

    const firstPayment = await recordPurchasePayment(organization.id, order.id, { amount: 4000, method: "Virement" }, user.id);
    expect(firstPayment.amount).toBe(4000);

    let supplierAfter = await prisma.comptaSupplier.findUniqueOrThrow({ where: { id: supplier.id } });
    expect(supplierAfter.balanceDue).toBe(6000);

    await recordPurchasePayment(organization.id, order.id, { amount: 6000, method: "Chèque" }, user.id);
    supplierAfter = await prisma.comptaSupplier.findUniqueOrThrow({ where: { id: supplier.id } });
    expect(supplierAfter.balanceDue).toBe(0);

    await expect(recordPurchasePayment(organization.id, order.id, { amount: 1, method: "Espèces" }, user.id)).rejects.toThrow(ValidationError);
  });

  it("liste et récupère une commande, isolée par organisation", async () => {
    const { organization, user } = await createOrgAndUser("list-get");
    const supplier = await createSupplier(organization.id, { name: "Metro", balanceDue: 0 }, user.id);
    const order = await createPurchaseOrder(organization.id, { supplierId: supplier.id, lines: [{ label: "X", quantity: 1, unitCost: 100 }] }, user.id);

    const listed = await listPurchaseOrders(organization.id);
    expect(listed.map((o) => o.id)).toContain(order.id);

    const { organization: otherOrg } = await createOrgAndUser("list-get-other");
    await expect(getPurchaseOrder(otherOrg.id, order.id)).rejects.toThrow(NotFoundError);
  });

  it("statistiques fournisseur : compte uniquement les commandes réceptionnées dans le total", async () => {
    const { organization, user } = await createOrgAndUser("stats");
    const supplier = await createSupplier(organization.id, { name: "Metro", balanceDue: 0 }, user.id);
    const received = await createPurchaseOrder(organization.id, { supplierId: supplier.id, lines: [{ label: "X", quantity: 1, unitCost: 5000 }] }, user.id);
    await receivePurchaseOrder(organization.id, received.id, user.id);
    await createPurchaseOrder(organization.id, { supplierId: supplier.id, lines: [{ label: "Y", quantity: 1, unitCost: 9999 }] }, user.id); // reste en DRAFT

    const stats = await getSupplierPurchaseStats(organization.id, supplier.id);
    expect(stats.orderCount).toBe(2);
    expect(stats.receivedOrderCount).toBe(1);
    expect(stats.totalReceivedAmount).toBe(5000);
  });
});
