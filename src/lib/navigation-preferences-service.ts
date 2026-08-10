import "server-only";
import { prisma } from "@/lib/prisma";
import { NAV_ITEMS } from "@/components/nav-config";
import type { navigationPreferencesUpdateSchema, NAV_PRESET_KEYS } from "@/lib/validations/navigation-preferences";
import type { z } from "zod";

/**
 * Navigation personnalisée par utilisateur — ne stocke que les ÉCARTS par rapport au menu par
 * défaut du rôle (`NAV_ITEMS`) : l'absence de ligne pour un `sectionKey` = visible, comportement
 * inchangé pour tout compte n'ayant jamais touché ce réglage. Masquer une section ne retire
 * jamais un droit d'accès — ça reste entièrement porté par les vérifications de rôle/permission
 * existantes (voir `SidebarNav`/`CommandPalette`, qui filtrent d'abord par rôle puis par ces
 * préférences).
 */

/** "Papa au comptoir" — le strict nécessaire pour le service, rien d'autre. */
const SERVICE_PIZZERIA_VISIBLE_KEYS = ["/dashboard", "/compta", "/compta/commandes", "/compta/rapide", "/compta/ventes", "/compta/stock", "/compta/caisse"];

function allKnownSectionKeys(): string[] {
  return NAV_ITEMS.map((item) => item.href);
}

/** Retourne uniquement les écarts (`sectionKey -> visible`) pour cet utilisateur/organisation — jamais une ligne pour tout ce qui reste au comportement par défaut. */
export async function listNavigationOverrides(userId: string, organizationId: string): Promise<Record<string, boolean>> {
  const rows = await prisma.userNavigationPreference.findMany({ where: { userId, organizationId } });
  return Object.fromEntries(rows.map((row) => [row.sectionKey, row.visible]));
}

export async function setNavigationPreferences(
  userId: string,
  organizationId: string,
  items: z.infer<typeof navigationPreferencesUpdateSchema>["items"]
) {
  await prisma.$transaction(
    items.map((item) =>
      prisma.userNavigationPreference.upsert({
        where: { userId_organizationId_sectionKey: { userId, organizationId, sectionKey: item.sectionKey } },
        create: { userId, organizationId, sectionKey: item.sectionKey, visible: item.visible },
        update: { visible: item.visible },
      })
    )
  );
  return listNavigationOverrides(userId, organizationId);
}

/** "Gestion complète" : efface tous les écarts existants — retombe sur le menu par défaut du rôle, rien de plus. */
async function applyFullAccessPreset(userId: string, organizationId: string) {
  await prisma.userNavigationPreference.deleteMany({ where: { userId, organizationId } });
}

/** "Service pizzeria" : seules les sections listées restent visibles, tout le reste du menu accessible au rôle est masqué. */
async function applyServicePizzeriaPreset(userId: string, organizationId: string) {
  const keys = allKnownSectionKeys();
  await prisma.$transaction([
    prisma.userNavigationPreference.deleteMany({ where: { userId, organizationId } }),
    prisma.userNavigationPreference.createMany({
      data: keys
        .filter((key) => !SERVICE_PIZZERIA_VISIBLE_KEYS.includes(key))
        .map((key) => ({ userId, organizationId, sectionKey: key, visible: false })),
    }),
  ]);
}

export async function applyNavigationPreset(userId: string, organizationId: string, preset: (typeof NAV_PRESET_KEYS)[number]) {
  if (preset === "service_pizzeria") {
    await applyServicePizzeriaPreset(userId, organizationId);
  } else {
    await applyFullAccessPreset(userId, organizationId);
  }
  return listNavigationOverrides(userId, organizationId);
}
