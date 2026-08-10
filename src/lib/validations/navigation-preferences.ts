import { z } from "zod";

// Navigation personnalisée par utilisateur (Paramètres → Menu / Navigation) —
// s'applique à l'ensemble de NAV_ITEMS (src/components/nav-config.ts), pas
// seulement à Compta Vellano. Masquer une section n'accorde ni ne retire
// jamais un droit d'accès (voir UserNavigationPreference, prisma/schema.prisma).

export const navigationPreferenceItemSchema = z.object({
  sectionKey: z.string().min(1).max(200),
  visible: z.boolean(),
});

export const navigationPreferencesUpdateSchema = z.object({
  // Absent = l'acteur modifie sa propre navigation ; sinon réservé aux administrateurs
  // (voir resolveTargetUserId dans les routes /api/settings/navigation).
  userId: z.string().optional().nullable(),
  items: z.array(navigationPreferenceItemSchema).min(1).max(200),
});

export const NAV_PRESET_KEYS = ["service_pizzeria", "gestion_complete"] as const;

export const navigationPresetSchema = z.object({
  userId: z.string().optional().nullable(),
  preset: z.enum(NAV_PRESET_KEYS),
});
