import "server-only";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { sumDenominations } from "@/lib/compta/money";
import type { comptaCashCountSchema } from "@/lib/validations/compta";
import type { z } from "zod";

export async function listCashCounts(organizationId: string, limit = 30) {
  return prisma.comptaCashCount.findMany({
    where: { organizationId },
    orderBy: { countedAt: "desc" },
    take: limit,
  });
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
