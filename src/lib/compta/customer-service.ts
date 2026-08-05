import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import type { comptaCustomerSchema, comptaCustomerUpdateSchema } from "@/lib/validations/compta";
import type { z } from "zod";

export async function listCustomers(organizationId: string) {
  return prisma.comptaCustomer.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export async function getCustomer(organizationId: string, id: string) {
  const customer = await prisma.comptaCustomer.findFirst({
    where: { id, organizationId },
    include: { sales: { orderBy: { soldAt: "desc" }, take: 20 } },
  });
  if (!customer) throw new NotFoundError("Client introuvable.");
  return customer;
}

export async function createCustomer(
  organizationId: string,
  data: z.infer<typeof comptaCustomerSchema>,
  actorUserId: string
) {
  const customer = await prisma.comptaCustomer.create({
    data: { organizationId, name: data.name, phone: data.phone || undefined, email: data.email || undefined, notes: data.notes || undefined },
  });
  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_customer.created",
    entityType: "ComptaCustomer",
    entityId: customer.id,
    metadata: { name: customer.name },
  });
  return customer;
}

export async function updateCustomer(
  organizationId: string,
  id: string,
  data: z.infer<typeof comptaCustomerUpdateSchema>,
  actorUserId: string
) {
  const existing = await prisma.comptaCustomer.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Client introuvable.");

  const customer = await prisma.comptaCustomer.update({
    where: { id },
    data: { ...data, email: data.email === undefined ? undefined : data.email || null },
  });
  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_customer.updated",
    entityType: "ComptaCustomer",
    entityId: customer.id,
  });
  return customer;
}

/**
 * 1 point de fidélité par euro TTC dépensé (arrondi au franc inférieur),
 * crédité à la création d'une vente qui référence le client — jamais
 * recalculé rétroactivement. Un remboursement (montant négatif) retire des
 * points au même taux, sans jamais faire passer le solde sous zéro.
 */
export async function accrueLoyaltyPoints(organizationId: string, customerId: string, saleTotalAmount: number) {
  const pointsDelta = Math.trunc(saleTotalAmount / 100);
  if (pointsDelta === 0) return;

  const customer = await prisma.comptaCustomer.findFirst({ where: { id: customerId, organizationId } });
  if (!customer) return;

  const newBalance = Math.max(0, customer.loyaltyPoints + pointsDelta);
  await prisma.comptaCustomer.update({ where: { id: customerId }, data: { loyaltyPoints: newBalance } });
}
