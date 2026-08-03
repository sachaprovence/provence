import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { requireAgentWorkspacePermission } from "@/lib/agents/permissions";
import { getGoogleCalendarBusySlots, trySyncAppointmentToGoogle } from "@/lib/calendar/google";
import { onAppointmentBooked } from "@/lib/automation-engine";
import { stopEnrollmentsForLead } from "@/lib/sequence-engine";
import { writeAuditLog } from "@/lib/audit";
import { publishAutomationEvent } from "@/lib/automation/triggers/event-dispatcher";
import { EnrollmentStopReason } from "@/generated/prisma/enums";
import type { ToolHandler } from "@/lib/agents/types";

/**
 * Outils déclaratifs de l'Agent Planning (v0.9) — réutilise l'intégration
 * Google Calendar RÉELLE (task #87) ; si l'organisation n'est pas
 * connectée, retombe sur les VRAIS rendez-vous déjà enregistrés
 * (`Appointment`) pour calculer les créneaux occupés — jamais une
 * disponibilité inventée. Voir ADR 0038 §agents métier.
 */

export const checkAvailabilityTool: ToolHandler<
  { fromIso: string; toIso: string },
  { busy: { start: string; end: string }[]; source: "google_calendar" | "appointments" }
> = {
  key: "planning.check_availability",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "VIEW_WORKSPACE");

    try {
      const busy = await getGoogleCalendarBusySlots(installation.organizationId, input.fromIso, input.toIso);
      return { busy, source: "google_calendar" };
    } catch {
      // Google Calendar non connecté pour cette organisation — repli honnête sur les rendez-vous déjà enregistrés.
      const appointments = await prisma.appointment.findMany({
        where: {
          organizationId: installation.organizationId,
          status: "SCHEDULED",
          startAt: { lt: new Date(input.toIso) },
          endAt: { gt: new Date(input.fromIso) },
        },
        select: { startAt: true, endAt: true },
      });
      return {
        busy: appointments.map((a) => ({ start: a.startAt.toISOString(), end: a.endAt.toISOString() })),
        source: "appointments",
      };
    }
  },
};

export const bookAppointmentTool: ToolHandler<
  { leadId: string; title: string; startAt: string; endAt: string; location?: string },
  { appointment: unknown }
> = {
  key: "planning.book_appointment",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "MANAGE_LEADS");

    const lead = await prisma.lead.findFirst({ where: { id: input.leadId, organizationId: installation.organizationId } });
    if (!lead) throw new NotFoundError("Prospect introuvable.");

    const appointment = await prisma.appointment.create({
      data: {
        organizationId: installation.organizationId,
        leadId: lead.id,
        title: input.title,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        location: input.location || undefined,
      },
    });

    await onAppointmentBooked(lead.id, installation.organizationId);
    await stopEnrollmentsForLead(lead.id, EnrollmentStopReason.APPOINTMENT_BOOKED);
    await trySyncAppointmentToGoogle(installation.organizationId, appointment);
    await publishAutomationEvent("appointment.created", { organizationId: installation.organizationId, leadId: lead.id, appointmentId: appointment.id });
    await writeAuditLog({
      organizationId: installation.organizationId,
      leadId: lead.id,
      action: "appointment.created",
      entityType: "Appointment",
      entityId: appointment.id,
      metadata: { source: "agent:planning" },
    });

    return { appointment };
  },
};

/** Créneaux libres = plage demandée moins les créneaux occupés déjà fournis (calcul déterministe, pas de génération IA). */
export const suggestSlotsTool: ToolHandler<
  { fromIso: string; toIso: string; durationMinutes: number; busy: { start: string; end: string }[] },
  { slots: { start: string; end: string }[] }
> = {
  key: "planning.suggest_slots",
  async handle(input, { installation }) {
    await requireAgentWorkspacePermission(installation, "VIEW_WORKSPACE");

    if (input.durationMinutes <= 0) throw new ValidationError("La durée doit être positive.");
    const durationMs = input.durationMinutes * 60 * 1000;
    const busyRanges = input.busy
      .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
      .sort((a, b) => a.start - b.start);

    const slots: { start: string; end: string }[] = [];
    let cursor = new Date(input.fromIso).getTime();
    const rangeEnd = new Date(input.toIso).getTime();

    function fillGapWithSlots(gapEnd: number) {
      while (gapEnd - cursor >= durationMs) {
        slots.push({ start: new Date(cursor).toISOString(), end: new Date(cursor + durationMs).toISOString() });
        cursor += durationMs;
      }
    }

    for (const busy of busyRanges) {
      fillGapWithSlots(busy.start);
      cursor = Math.max(cursor, busy.end);
    }
    fillGapWithSlots(rangeEnd);

    return { slots };
  },
};

export const planningTools: ToolHandler[] = [checkAvailabilityTool, bookAppointmentTool, suggestSlotsTool];
