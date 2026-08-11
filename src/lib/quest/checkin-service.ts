import "server-only";
import { prisma } from "@/lib/prisma";

export async function createCheckIn(
  userId: string,
  data: { energy?: number | null; motivation?: number | null; availableMinutes?: number | null }
) {
  return prisma.questCheckIn.create({
    data: {
      userId,
      energy: data.energy ?? undefined,
      motivation: data.motivation ?? undefined,
      availableMinutes: data.availableMinutes ?? undefined,
    },
  });
}

export async function getLatestCheckIn(userId: string) {
  return prisma.questCheckIn.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
}
