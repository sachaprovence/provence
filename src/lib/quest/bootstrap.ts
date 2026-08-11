import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Initialise paresseusement le profil/les stats d'un utilisateur Personal
 * Quest AI au premier usage — pas de hook d'inscription dédié (le module
 * réutilise l'utilisateur CRM existant, voir ADR 0049), donc l'idempotence
 * est assurée par `upsert` à chaque point d'entrée qui en a besoin.
 */
export async function ensureUserBootstrap(userId: string) {
  const [profile, stat] = await Promise.all([
    prisma.questUserProfile.upsert({
      where: { userId },
      update: {},
      create: { userId },
    }),
    prisma.questUserStat.upsert({
      where: { userId },
      update: {},
      create: { userId },
    }),
  ]);
  return { profile, stat };
}
