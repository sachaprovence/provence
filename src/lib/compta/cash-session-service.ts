import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { sumDenominations } from "@/lib/compta/money";
import { ComptaPaymentMethod, ComptaSaleStatus } from "@/generated/prisma/enums";
import type { comptaCashSessionOpenSchema, comptaCashSessionCloseSchema } from "@/lib/validations/compta";
import type { z } from "zod";

export async function getOpenSession(organizationId: string) {
  return prisma.comptaCashSession.findFirst({ where: { organizationId, closedAt: null }, orderBy: { openedAt: "desc" } });
}

export async function listCashSessions(organizationId: string, limit = 30) {
  return prisma.comptaCashSession.findMany({ where: { organizationId }, orderBy: { openedAt: "desc" }, take: limit });
}

export async function getCashSession(organizationId: string, id: string) {
  const session = await prisma.comptaCashSession.findFirst({ where: { id, organizationId } });
  if (!session) throw new NotFoundError("Session de caisse introuvable.");
  return session;
}

/**
 * Répartition du CA par mode de paiement sur la fenêtre d'une session
 * (ouverte ou fermée) — calculée à la volée depuis `ComptaSale`, jamais
 * stockée : une session ouverte doit toujours refléter les ventes réelles
 * au moment où on la consulte, pas un total figé à l'ouverture.
 */
export async function getPaymentBreakdown(
  organizationId: string,
  window: { openedAt: Date; closedAt: Date | null }
): Promise<Record<ComptaPaymentMethod, number>> {
  const sales = await prisma.comptaSale.findMany({
    where: {
      organizationId,
      soldAt: { gte: window.openedAt, lte: window.closedAt ?? new Date() },
      status: { not: ComptaSaleStatus.CANCELLED },
    },
    select: { paymentMethod: true, totalAmount: true },
  });

  const breakdown = Object.fromEntries(Object.values(ComptaPaymentMethod).map((method) => [method, 0])) as Record<
    ComptaPaymentMethod,
    number
  >;
  for (const sale of sales) {
    breakdown[sale.paymentMethod] += sale.totalAmount;
  }
  return breakdown;
}

export async function getSessionPaymentBreakdown(organizationId: string, id: string) {
  const session = await getCashSession(organizationId, id);
  return getPaymentBreakdown(organizationId, { openedAt: session.openedAt, closedAt: session.closedAt });
}

export async function openCashSession(
  organizationId: string,
  data: z.infer<typeof comptaCashSessionOpenSchema>,
  actorUserId: string
) {
  const existing = await getOpenSession(organizationId);
  if (existing) throw new ConflictError("Une session de caisse est déjà ouverte.");

  const session = await prisma.comptaCashSession.create({
    data: { organizationId, openingFloat: data.openingFloat, openedById: actorUserId, notes: data.notes || undefined },
  });

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_cash_session.opened",
    entityType: "ComptaCashSession",
    entityId: session.id,
    metadata: { openingFloat: session.openingFloat },
  });

  return session;
}

/**
 * Fermeture : le théorique espèces = fond de caisse à l'ouverture + ventes
 * espèces de la session. L'écart compare ce théorique au comptage
 * billets/pièces réel — même logique que `ComptaCashCount` en v1, appliquée
 * ici à la fenêtre exacte de la session plutôt qu'à un instant isolé.
 */
export async function closeCashSession(
  organizationId: string,
  id: string,
  data: z.infer<typeof comptaCashSessionCloseSchema>,
  actorUserId: string
) {
  const session = await getCashSession(organizationId, id);
  if (session.closedAt) throw new ConflictError("Cette session de caisse est déjà fermée.");

  const breakdown = await getPaymentBreakdown(organizationId, { openedAt: session.openedAt, closedAt: null });
  const theoreticalAmount = session.openingFloat + breakdown[ComptaPaymentMethod.CASH];
  const countedAmount = sumDenominations(data.denominations);
  const differenceAmount = countedAmount - theoreticalAmount;

  const closed = await prisma.comptaCashSession.update({
    where: { id },
    data: {
      closedAt: new Date(),
      closedById: actorUserId,
      closingCountedAmount: countedAmount,
      theoreticalAmount,
      differenceAmount,
      denominations: data.denominations ?? undefined,
      notes: data.notes || session.notes || undefined,
    },
  });

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_cash_session.closed",
    entityType: "ComptaCashSession",
    entityId: id,
    metadata: { differenceAmount, theoreticalAmount, countedAmount },
  });

  return closed;
}
