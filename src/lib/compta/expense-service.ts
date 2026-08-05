import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { extractVatFromTtc } from "@/lib/compta/money";
import type { comptaExpenseSchema, comptaExpenseUpdateSchema } from "@/lib/validations/compta";
import type { z } from "zod";

export async function listExpenses(organizationId: string, filters: { from?: Date; to?: Date } = {}) {
  return prisma.comptaExpense.findMany({
    where: {
      organizationId,
      spentAt: filters.from || filters.to ? { gte: filters.from, lt: filters.to } : undefined,
    },
    include: { supplier: { select: { id: true, name: true } } },
    orderBy: { spentAt: "desc" },
  });
}

export async function getExpense(organizationId: string, id: string) {
  const expense = await prisma.comptaExpense.findFirst({
    where: { id, organizationId },
    include: { supplier: { select: { id: true, name: true } } },
  });
  if (!expense) throw new NotFoundError("Dépense introuvable.");
  return expense;
}

export async function createExpense(
  organizationId: string,
  data: z.infer<typeof comptaExpenseSchema>,
  actorUserId: string
) {
  const vatAmount = extractVatFromTtc(data.amount, data.vatRate);

  const expense = await prisma.comptaExpense.create({
    data: {
      organizationId,
      spentAt: data.spentAt,
      amount: data.amount,
      vatRate: data.vatRate,
      vatAmount,
      category: data.category,
      description: data.description,
      supplierId: data.supplierId || undefined,
      createdById: actorUserId,
    },
  });

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_expense.created",
    entityType: "ComptaExpense",
    entityId: expense.id,
    metadata: { amount: expense.amount, category: expense.category },
  });

  return expense;
}

export async function updateExpense(
  organizationId: string,
  id: string,
  data: z.infer<typeof comptaExpenseUpdateSchema>,
  actorUserId: string
) {
  const existing = await prisma.comptaExpense.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Dépense introuvable.");

  const amount = data.amount ?? existing.amount;
  const vatRate = data.vatRate ?? existing.vatRate;

  const expense = await prisma.comptaExpense.update({
    where: { id },
    data: {
      ...data,
      supplierId: data.supplierId === undefined ? undefined : data.supplierId || null,
      vatAmount: extractVatFromTtc(amount, vatRate),
    },
  });

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_expense.updated",
    entityType: "ComptaExpense",
    entityId: expense.id,
  });

  return expense;
}

export async function deleteExpense(organizationId: string, id: string, actorUserId: string) {
  const existing = await prisma.comptaExpense.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Dépense introuvable.");

  await prisma.comptaExpense.delete({ where: { id } });
  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_expense.deleted",
    entityType: "ComptaExpense",
    entityId: id,
    metadata: { amount: existing.amount },
  });
}
