import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getStorageProvider } from "@/lib/storage";
import { logger } from "@/lib/logger";
import type { attachmentCreateSchema, ATTACHMENT_ENTITY_TYPES } from "@/lib/validations/crm";
import type { z } from "zod";

type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

/**
 * Vérifie que `entityId` désigne bien une ressource de `entityType`
 * appartenant à `organizationId`, avant toute écriture — évite qu'un acteur
 * d'une organisation attache un fichier à une ressource d'une autre
 * organisation en devinant un id (voir ADR 0038, convention polymorphe
 * héritée d'`AuditLog`).
 */
async function assertEntityInOrganization(organizationId: string, entityType: AttachmentEntityType, entityId: string) {
  const found = await (async () => {
    switch (entityType) {
      case "Lead":
        return prisma.lead.findFirst({ where: { id: entityId, organizationId }, select: { id: true } });
      case "Company":
        return prisma.company.findFirst({ where: { id: entityId, organizationId }, select: { id: true } });
      case "Property":
        return prisma.property.findFirst({ where: { id: entityId, organizationId }, select: { id: true } });
      case "VirtualTour":
        return prisma.virtualTour.findFirst({ where: { id: entityId, organizationId }, select: { id: true } });
      case "Quote":
        return prisma.quote.findFirst({ where: { id: entityId, organizationId }, select: { id: true } });
      case "Invoice":
        return prisma.invoice.findFirst({ where: { id: entityId, organizationId }, select: { id: true } });
    }
  })();

  if (!found) throw new ValidationError(`La ressource "${entityType}" indiquée est introuvable dans cette organisation.`);
}

export async function listAttachments(organizationId: string, entityType: string, entityId: string) {
  return prisma.attachment.findMany({
    where: { organizationId, entityType, entityId },
    include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createAttachment(
  organizationId: string,
  uploadedById: string | null,
  data: z.infer<typeof attachmentCreateSchema>
) {
  await assertEntityInOrganization(organizationId, data.entityType, data.entityId);

  return prisma.attachment.create({
    data: {
      organizationId,
      workspaceId: data.workspaceId || undefined,
      entityType: data.entityType,
      entityId: data.entityId,
      category: data.category,
      fileName: data.fileName,
      url: data.url,
      storageKey: data.storageKey || undefined,
      mimeType: data.mimeType || undefined,
      sizeBytes: data.sizeBytes ?? undefined,
      uploadedById: uploadedById || undefined,
    },
  });
}

/**
 * Supprime réellement le fichier chez le fournisseur de stockage AVANT la
 * ligne `Attachment` (v1.2, AR-0164) — jamais l'inverse : si la suppression
 * du fichier échoue (réseau, fournisseur indisponible), la ligne reste en
 * base et l'opération peut être rejouée ; supprimer la ligne d'abord
 * laisserait un fichier orphelin, accessible par sa clé, sans plus aucune
 * trace en base pour le retrouver et le nettoyer plus tard.
 *
 * Les pièces jointes créées avant AR-0164 n'ont pas de `storageKey`
 * (colonne ajoutée après coup, jamais rétro-remplie) : leur ligne est
 * supprimée sans tentative de suppression physique, journalisée pour
 * traçabilité plutôt que silencieusement ignorée.
 */
export async function deleteAttachment(organizationId: string, id: string) {
  const existing = await prisma.attachment.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Pièce jointe introuvable.");

  if (existing.storageKey) {
    await getStorageProvider().delete({ organizationId, key: existing.storageKey });
  } else {
    logger.warn(
      { attachmentId: existing.id, organizationId },
      "Pièce jointe sans storageKey (antérieure à AR-0164) — suppression de la ligne uniquement, fichier physique non nettoyé."
    );
  }

  await prisma.attachment.delete({ where: { id } });
}
