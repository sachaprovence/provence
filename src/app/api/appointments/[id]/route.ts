import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { appointmentUpdateSchema } from "@/lib/validations/appointment";
import { trySyncAppointmentToGoogle, deleteGoogleEventForAppointment } from "@/lib/calendar/google";
import { AppointmentStatus } from "@/generated/prisma/enums";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;
  const existing = await prisma.appointment.findFirst({ where: { id, organizationId: actor.organization.id } });
  if (!existing) return NextResponse.json({ error: "Rendez-vous introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = appointmentUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const { leadId: _leadId, ...rest } = parsed.data;
  const appointment = await prisma.appointment.update({ where: { id }, data: rest });

  if (appointment.status === AppointmentStatus.CANCELLED) {
    await deleteGoogleEventForAppointment(actor.organization.id, appointment).catch(() => undefined);
  } else {
    await trySyncAppointmentToGoogle(actor.organization.id, appointment);
  }

  return NextResponse.json({ appointment });
}
