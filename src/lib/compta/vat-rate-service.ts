import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import type { comptaVatRateSchema, comptaVatRateUpdateSchema } from "@/lib/validations/compta";
import type { z } from "zod";

/** Trois taux courants en restauration française — amorce uniquement, jamais réappliqué si l'organisation a déjà créé/supprimé ses propres taux (voir `listVatRates`). */
const DEFAULT_VAT_RATES: { name: string; rate: number }[] = [
  { name: "TVA réduite", rate: 5.5 },
  { name: "TVA restauration", rate: 10 },
  { name: "TVA normale", rate: 20 },
];

/**
 * Amorçage paresseux et idempotent : ne crée les taux par défaut QUE si l'organisation n'en a
 * jamais eu aucun. Un simple `count > 0` ne suffit pas — après une suppression volontaire de tous
 * les taux, le compte retomberait à 0 et serait réamorcé à tort. On journalise donc l'amorçage
 * lui-même dans l'audit log, qui persiste indéfiniment, pour ne jamais réamorcer une organisation
 * qui a déjà été initialisée une fois.
 */
async function ensureDefaultVatRates(organizationId: string) {
  const count = await prisma.comptaVatRate.count({ where: { organizationId } });
  if (count > 0) return;

  const alreadySeeded = await prisma.auditLog.findFirst({
    where: { organizationId, action: "compta_vat_rate.seeded" },
    select: { id: true },
  });
  if (alreadySeeded) return;

  await prisma.$transaction([
    prisma.comptaVatRate.createMany({
      data: DEFAULT_VAT_RATES.map((rate) => ({ organizationId, name: rate.name, rate: rate.rate })),
    }),
    prisma.auditLog.create({
      data: { organizationId, action: "compta_vat_rate.seeded", entityType: "ComptaVatRate", metadata: { count: DEFAULT_VAT_RATES.length } },
    }),
  ]);
}

export async function listVatRates(organizationId: string, filters: { activeOnly?: boolean } = {}) {
  await ensureDefaultVatRates(organizationId);
  return prisma.comptaVatRate.findMany({
    where: { organizationId, isActive: filters.activeOnly ? true : undefined },
    orderBy: { rate: "asc" },
  });
}

export async function getVatRate(organizationId: string, id: string) {
  const rate = await prisma.comptaVatRate.findFirst({ where: { id, organizationId } });
  if (!rate) throw new NotFoundError("Taux de TVA introuvable.");
  return rate;
}

export async function createVatRate(organizationId: string, data: z.infer<typeof comptaVatRateSchema>, actorUserId: string) {
  const existing = await prisma.comptaVatRate.findFirst({ where: { organizationId, name: data.name } });
  if (existing) throw new ConflictError("Un taux de TVA porte déjà ce nom.");

  const rate = await prisma.comptaVatRate.create({ data: { organizationId, ...data } });
  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_vat_rate.created",
    entityType: "ComptaVatRate",
    entityId: rate.id,
    metadata: { name: rate.name, rate: rate.rate },
  });
  return rate;
}

/**
 * Modifie un taux (nom, pourcentage, actif/inactif). Si `rate.rate` change, synchronise
 * `ComptaProduct.vatRate` de tous les produits qui pointent vers ce taux (`vatRateId`) — pour que
 * "le" taux courant reste une source unique de vérité, jamais une valeur qui dérive
 * silencieusement. NE TOUCHE JAMAIS l'historique : `ComptaSaleLine.vatRate`,
 * `ComptaOrderLine.vatRateSnapshot` et `ComptaExpense.vatRate` sont des copies figées,
 * indépendantes de ce taux, jamais recalculées ici.
 */
export async function updateVatRate(
  organizationId: string,
  id: string,
  data: z.infer<typeof comptaVatRateUpdateSchema>,
  actorUserId: string
) {
  const existing = await getVatRate(organizationId, id);

  if (data.name && data.name !== existing.name) {
    const nameTaken = await prisma.comptaVatRate.findFirst({ where: { organizationId, name: data.name, id: { not: id } } });
    if (nameTaken) throw new ConflictError("Un taux de TVA porte déjà ce nom.");
  }

  const [rate] = await prisma.$transaction([
    prisma.comptaVatRate.update({ where: { id }, data }),
    ...(data.rate !== undefined && data.rate !== existing.rate
      ? [prisma.comptaProduct.updateMany({ where: { organizationId, vatRateId: id }, data: { vatRate: data.rate } })]
      : []),
  ]);

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_vat_rate.updated",
    entityType: "ComptaVatRate",
    entityId: id,
    metadata: { name: rate.name, rate: rate.rate },
  });

  return rate;
}
