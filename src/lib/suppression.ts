import { prisma } from "@/lib/prisma";
import { SuppressionReason } from "@/generated/prisma/enums";

/**
 * Vérifie si un email ou téléphone est bloqué pour l'organisation (désinscription,
 * bounce, exclusion manuelle). Doit être appelé avant toute tentative d'envoi
 * et avant tout enrôlement en séquence.
 */
export async function isSuppressed(organizationId: string, email?: string | null, phone?: string | null) {
  if (!email && !phone) return false;
  const entry = await prisma.suppressionEntry.findFirst({
    where: {
      organizationId,
      OR: [email ? { email } : undefined, phone ? { phone } : undefined].filter(
        (v): v is { email: string } | { phone: string } => Boolean(v)
      ),
    },
  });
  return Boolean(entry);
}

export async function addSuppression(params: {
  organizationId: string;
  email?: string | null;
  phone?: string | null;
  reason: SuppressionReason;
  note?: string;
}) {
  if (!params.email && !params.phone) {
    throw new Error("Un email ou un téléphone est requis pour une entrée de liste d'exclusion.");
  }
  if (params.email) {
    await prisma.suppressionEntry.upsert({
      where: { organizationId_email: { organizationId: params.organizationId, email: params.email } },
      update: { reason: params.reason, note: params.note },
      create: {
        organizationId: params.organizationId,
        email: params.email,
        phone: params.phone,
        reason: params.reason,
        note: params.note,
      },
    });
  } else {
    await prisma.suppressionEntry.create({
      data: {
        organizationId: params.organizationId,
        phone: params.phone,
        reason: params.reason,
        note: params.note,
      },
    });
  }
}
