import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse, NotFoundError } from "@/lib/errors";
import { syncAppointmentToGoogle } from "@/lib/calendar/google";

type Params = { params: Promise<{ id: string }> };

/** Synchronisation manuelle vers Google Calendar (la synchronisation automatique est déclenchée à la création/modification). */
export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const appointment = await prisma.appointment.findFirst({ where: { id, organizationId: actor.organization.id } });
    if (!appointment) throw new NotFoundError("Rendez-vous introuvable.");

    await syncAppointmentToGoogle(actor.organization.id, appointment);
    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id } });
    return NextResponse.json({ appointment: updated });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/appointments/[id]/sync-to-google" });
  }
}
