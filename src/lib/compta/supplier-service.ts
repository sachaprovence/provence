import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import type { comptaSupplierSchema, comptaSupplierUpdateSchema } from "@/lib/validations/compta";
import type { z } from "zod";

export async function listSuppliers(organizationId: string) {
  return prisma.comptaSupplier.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export async function getSupplier(organizationId: string, id: string) {
  const supplier = await prisma.comptaSupplier.findFirst({
    where: { id, organizationId },
    include: { expenses: { orderBy: { spentAt: "desc" }, take: 20 } },
  });
  if (!supplier) throw new NotFoundError("Fournisseur introuvable.");
  return supplier;
}

export async function createSupplier(
  organizationId: string,
  data: z.infer<typeof comptaSupplierSchema>,
  actorUserId: string
) {
  const supplier = await prisma.comptaSupplier.create({
    data: { organizationId, ...data, email: data.email || undefined },
  });
  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_supplier.created",
    entityType: "ComptaSupplier",
    entityId: supplier.id,
    metadata: { name: supplier.name },
  });
  return supplier;
}

export async function updateSupplier(
  organizationId: string,
  id: string,
  data: z.infer<typeof comptaSupplierUpdateSchema>,
  actorUserId: string
) {
  const existing = await prisma.comptaSupplier.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Fournisseur introuvable.");

  const supplier = await prisma.comptaSupplier.update({
    where: { id },
    data: { ...data, email: data.email || undefined },
  });
  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_supplier.updated",
    entityType: "ComptaSupplier",
    entityId: supplier.id,
  });
  return supplier;
}
