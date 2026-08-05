import "server-only";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import type { comptaCashCountSchema } from "@/lib/validations/compta";
import type { z } from "zod";

export async function listCashCounts(organizationId: string, limit = 30) {
  return prisma.comptaCashCount.findMany({
    where: { organizationId },
    orderBy: { countedAt: "desc" },
    take: limit,
  });
}

/**
 * Comptage manuel : `countedAmount` est dérivé ici du détail billets/pièces
 * (`denominations`) plutôt que transmis tel quel par le client, pour que le
 * total affiché corresponde toujours exactement au détail saisi.
 */
function sumDenominations(denominations: z.infer<typeof comptaCashCountSchema>["denominations"]): number {
  if (!denominations) return 0;
  const bills = Object.entries(denominations.bills ?? {}).reduce(
    (sum, [value, count]) => sum + Number(value) * 100 * count,
    0
  );
  const coins = Object.entries(denominations.coins ?? {}).reduce(
    (sum, [value, count]) => sum + Number(value) * 100 * count,
    0
  );
  return bills + coins;
}

export async function createCashCount(
  organizationId: string,
  data: z.infer<typeof comptaCashCountSchema>,
  actorUserId: string
) {
  const countedAmount = sumDenominations(data.denominations);
  const differenceAmount = countedAmount - data.theoreticalAmount;

  const cashCount = await prisma.comptaCashCount.create({
    data: {
      organizationId,
      countedAt: data.countedAt ?? new Date(),
      theoreticalAmount: data.theoreticalAmount,
      countedAmount,
      differenceAmount,
      denominations: data.denominations ?? undefined,
      notes: data.notes || undefined,
      createdById: actorUserId,
    },
  });

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_cash_count.created",
    entityType: "ComptaCashCount",
    entityId: cashCount.id,
    metadata: { differenceAmount },
  });

  return cashCount;
}
