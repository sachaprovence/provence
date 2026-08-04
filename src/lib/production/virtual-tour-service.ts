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
  latitude?: number | null;
  longitude?: number | null;
  surfaceM2?: number | null;
  scheduledAt?: Date | null;
  /** Durée prévue de la prise de vue, en minutes (v1.1, AR-0166). */
  scheduledDurationMinutes?: number | null;
  /** Matériel utilisé — texte libre (v1.1, AR-0166). */
  equipmentUsed?: string | null;
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
    include: { lead: true, property: true, mission: { include: { provider: true } }, invoice: true },
  });
  if (!tour) throw new NotFoundError("Visite 3D introuvable.");
  return tour;
}

/**
 * Reprend directement les coordonnées du bien lié quand elles ne sont pas
 * explicitement fournies (v1.1, AR-0166) — évite une double saisie quand la
 * visite est déjà rattachée à une `Property` géolocalisée.
 */
async function resolveCoordinates(
  organizationId: string,
  propertyId: string | null | undefined,
  latitude: number | null | undefined,
  longitude: number | null | undefined
): Promise<{ latitude?: number; longitude?: number }> {
  if (latitude != null && longitude != null) return { latitude, longitude };
  if (!propertyId) return {};
  const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId }, select: { latitude: true, longitude: true } });
  if (property?.latitude != null && property?.longitude != null) return { latitude: property.latitude, longitude: property.longitude };
  return {};
}

export async function createVirtualTour(organizationId: string, data: VirtualTourInput) {
  const leadId = await resolveLeadIdFromMission(organizationId, data.missionId);

  if (data.propertyId) {
    const property = await prisma.property.findFirst({ where: { id: data.propertyId, organizationId, leadId } });
    if (!property) throw new ValidationError("Le bien immobilier indiqué n'appartient pas au même client que la mission.");
  }

  const coordinates = await resolveCoordinates(organizationId, data.propertyId, data.latitude, data.longitude);

  const tour = await prisma.virtualTour.create({
    data: {
      organizationId,
      leadId,
      missionId: data.missionId,
      propertyId: data.propertyId || undefined,
      type: data.type ?? PropertyType.OTHER,
      address: data.address || undefined,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      surfaceM2: data.surfaceM2 ?? undefined,
      scheduledAt: data.scheduledAt || undefined,
      scheduledDurationMinutes: data.scheduledDurationMinutes ?? undefined,
      equipmentUsed: data.equipmentUsed || undefined,
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
  await publishAutomationEvent("virtual_tour.created", { organizationId, leadId, virtualTourId: tour.id });

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

  const coordinates =
    data.latitude !== undefined || data.longitude !== undefined || data.propertyId !== undefined
      ? await resolveCoordinates(organizationId, data.propertyId ?? existing.propertyId, data.latitude, data.longitude)
      : {};

  const tour = await prisma.virtualTour.update({
    where: { id },
    data: {
      propertyId: data.propertyId === undefined ? undefined : data.propertyId || null,
      type: data.type,
      address: data.address === undefined ? undefined : data.address || null,
      latitude: coordinates.latitude ?? (data.latitude === undefined ? undefined : data.latitude),
      longitude: coordinates.longitude ?? (data.longitude === undefined ? undefined : data.longitude),
      surfaceM2: data.surfaceM2 === undefined ? undefined : data.surfaceM2,
      scheduledAt: data.scheduledAt === undefined ? undefined : data.scheduledAt,
      scheduledDurationMinutes: data.scheduledDurationMinutes === undefined ? undefined : data.scheduledDurationMinutes,
      equipmentUsed: data.equipmentUsed === undefined ? undefined : data.equipmentUsed || null,
      matterportUrl: data.matterportUrl === undefined ? undefined : data.matterportUrl || null,
      tourUrl: data.tourUrl === undefined ? undefined : data.tourUrl || null,
      notes: data.notes === undefined ? undefined : data.notes || null,
      status: data.status,
    },
  });

  if (data.status === VirtualTourStatus.SHOOTING_DONE) {
    await publishAutomationEvent("virtual_tour.shooting_done", { organizationId, leadId: existing.leadId, virtualTourId: tour.id });
  }
  if (data.status === VirtualTourStatus.PUBLISHED) {
    await publishAutomationEvent("virtual_tour.published", { organizationId, leadId: existing.leadId, virtualTourId: tour.id });
  }

  return tour;
}
