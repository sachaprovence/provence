import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { publishAutomationEvent } from "@/lib/automation/triggers/event-dispatcher";
import { VirtualTourStatus, PropertyType } from "@/generated/prisma/enums";

/**
 * Module "Visites 3D" (brief v0.9 : "Chaque visite doit contenir : client,
 * adresse, type, surface, date, statut, lien Matterport, lien visite,
 * photos, documents, facture, historique, notes.") — `VirtualTour` est lié
 * à un `Mission` existant (réutilise sa planification/son prestataire/son
 * statut d'exécution) plutôt que de dupliquer ce mécanisme (voir ADR 0038).
 * `leadId` est TOUJOURS dérivé du `Mission` (via `Mission.customer.leadId`),
 * jamais accepté séparément en entrée — élimine tout risque d'incohérence.
 */

export interface VirtualTourInput {
  missionId: string;
  propertyId?: string | null;
  type?: PropertyType;
  address?: string | null;
  surfaceM2?: number | null;
  scheduledAt?: Date | null;
  matterportUrl?: string | null;
  tourUrl?: string | null;
  notes?: string | null;
}

async function resolveLeadIdFromMission(organizationId: string, missionId: string) {
  const mission = await prisma.mission.findFirst({
    where: { id: missionId, organizationId },
    include: { customer: { select: { leadId: true } } },
  });
  if (!mission) throw new ValidationError("Mission introuvable dans cette organisation.");
  return mission.customer.leadId;
}

export async function listVirtualTours(organizationId: string, filters: { leadId?: string; status?: VirtualTourStatus } = {}) {
  return prisma.virtualTour.findMany({
    where: { organizationId, leadId: filters.leadId || undefined, status: filters.status || undefined },
    include: {
      lead: { select: { id: true, establishmentName: true } },
      property: { select: { id: true, label: true } },
      mission: { select: { id: true, title: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getVirtualTour(organizationId: string, id: string) {
  const tour = await prisma.virtualTour.findFirst({
    where: { id, organizationId },
    include: { lead: true, property: true, mission: true, invoice: true },
  });
  if (!tour) throw new NotFoundError("Visite 3D introuvable.");
  return tour;
}

export async function createVirtualTour(organizationId: string, data: VirtualTourInput) {
  const leadId = await resolveLeadIdFromMission(organizationId, data.missionId);

  if (data.propertyId) {
    const property = await prisma.property.findFirst({ where: { id: data.propertyId, organizationId, leadId } });
    if (!property) throw new ValidationError("Le bien immobilier indiqué n'appartient pas au même client que la mission.");
  }

  const tour = await prisma.virtualTour.create({
    data: {
      organizationId,
      leadId,
      missionId: data.missionId,
      propertyId: data.propertyId || undefined,
      type: data.type ?? PropertyType.OTHER,
      address: data.address || undefined,
      surfaceM2: data.surfaceM2 ?? undefined,
      scheduledAt: data.scheduledAt || undefined,
      matterportUrl: data.matterportUrl || undefined,
      tourUrl: data.tourUrl || undefined,
      notes: data.notes || undefined,
    },
  });

  await writeAuditLog({
    organizationId,
    leadId,
    action: "virtual_tour.created",
    entityType: "VirtualTour",
    entityId: tour.id,
  });
  await publishAutomationEvent("virtual_tour.created", { organizationId, leadId });

  return tour;
}

export async function updateVirtualTour(
  organizationId: string,
  id: string,
  data: Partial<VirtualTourInput> & { status?: VirtualTourStatus }
) {
  const existing = await prisma.virtualTour.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Visite 3D introuvable.");

  if (data.propertyId) {
    const property = await prisma.property.findFirst({ where: { id: data.propertyId, organizationId, leadId: existing.leadId } });
    if (!property) throw new ValidationError("Le bien immobilier indiqué n'appartient pas au même client que la visite.");
  }

  const tour = await prisma.virtualTour.update({
    where: { id },
    data: {
      propertyId: data.propertyId === undefined ? undefined : data.propertyId || null,
      type: data.type,
      address: data.address === undefined ? undefined : data.address || null,
      surfaceM2: data.surfaceM2 === undefined ? undefined : data.surfaceM2,
      scheduledAt: data.scheduledAt === undefined ? undefined : data.scheduledAt,
      matterportUrl: data.matterportUrl === undefined ? undefined : data.matterportUrl || null,
      tourUrl: data.tourUrl === undefined ? undefined : data.tourUrl || null,
      notes: data.notes === undefined ? undefined : data.notes || null,
      status: data.status,
    },
  });

  if (data.status === VirtualTourStatus.PUBLISHED) {
    await publishAutomationEvent("virtual_tour.published", { organizationId, leadId: existing.leadId });
  }

  return tour;
}
