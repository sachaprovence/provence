import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { requireAgentWorkspacePermission } from "@/lib/agents/permissions";
import { updateVirtualTour } from "@/lib/production/virtual-tour-service";
import { VirtualTourStatus } from "@/generated/prisma/enums";
import type { ToolHandler } from "@/lib/agents/types";

/**
 * Outils déclaratifs de l'Agent Visites (v1.1, AR-0174) — surveille le
 * pipeline des visites 3D LUI-MÊME (`VirtualTour` réel, voir ADR 0038
 * §agents métier) : aucun agent existant ne détecte une visite bloquée
 * trop longtemps à un statut avant sa publication (l'Agent Réseaux
 * Sociaux, `social-tools.ts`, ne rédige que des posts APRÈS publication).
 */

/** Seuils de blocage par statut, en heures — au-delà, une visite est considérée bloquée. */
const STALL_THRESHOLD_HOURS: Partial<Record<VirtualTourStatus, number>> = {
  [VirtualTourStatus.SCHEDULED]: 24, // prise de vue prévue passée depuis plus de 24h sans avancer
  [VirtualTourStatus.SHOOTING_DONE]: 48, // prise de vue faite, non traitée depuis plus de 48h
  [VirtualTourStatus.PROCESSING]: 120, // en traitement depuis plus de 5 jours sans publication
};

function hoursSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}

export const detectStalledToursTool: ToolHandler<
  { limit?: number } | undefined,
  { tours: { id: string; leadEstablishmentName: string; status: VirtualTourStatus; stalledHours: number }[] }
> = {
  key: "visites.detect_stalled_tours",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "VIEW_WORKSPACE");

    const tours = await prisma.virtualTour.findMany({
      where: {
        organizationId: installation.organizationId,
        status: { in: Object.keys(STALL_THRESHOLD_HOURS) as VirtualTourStatus[] },
      },
      include: { lead: { select: { establishmentName: true } } },
      take: input?.limit ?? 100,
    });

    const stalled = tours
      .map((tour) => {
        // Pour SCHEDULED, l'horloge de blocage démarre à la date de prise de vue prévue (si passée), pas la création.
        const reference = tour.status === VirtualTourStatus.SCHEDULED && tour.scheduledAt ? tour.scheduledAt : tour.updatedAt;
        return {
          id: tour.id,
          leadEstablishmentName: tour.lead.establishmentName,
          status: tour.status,
          stalledHours: Math.round(hoursSince(reference)),
        };
      })
      .filter((tour) => tour.stalledHours >= (STALL_THRESHOLD_HOURS[tour.status] ?? Infinity))
      .sort((a, b) => b.stalledHours - a.stalledHours);

    return { tours: stalled };
  },
};

export const requestTechnicianFollowupTool: ToolHandler<
  { virtualTourId: string; message?: string },
  { notificationId: string }
> = {
  key: "visites.request_technician_followup",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "EXECUTE_MISSIONS");

    const tour = await prisma.virtualTour.findFirst({
      where: { id: input.virtualTourId, organizationId: installation.organizationId },
      include: { lead: { select: { establishmentName: true } } },
    });
    if (!tour) throw new NotFoundError("Visite 3D introuvable.");

    const notification = await prisma.notification.create({
      data: {
        organizationId: installation.organizationId,
        type: "visites_agent.technician_followup",
        title: `Relance technicien — visite ${tour.lead.establishmentName}`,
        body: input.message ?? `La visite est bloquée au statut "${tour.status}" depuis trop longtemps.`,
        link: `/visits/${tour.id}`,
      },
    });

    return { notificationId: notification.id };
  },
};

export const advanceTourStatusTool: ToolHandler<{ virtualTourId: string; status: VirtualTourStatus }, { tour: unknown }> = {
  key: "visites.advance_status",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "EXECUTE_MISSIONS");
    const tour = await updateVirtualTour(installation.organizationId, input.virtualTourId, { status: input.status });
    return { tour };
  },
};

export const visitesTools: ToolHandler[] = [detectStalledToursTool, requestTechnicianFollowupTool, advanceTourStatusTool];
