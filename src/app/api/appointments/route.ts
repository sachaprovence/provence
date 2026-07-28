import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse, requireSalesFeatureApi } from "@/lib/api-helpers";
import { appointmentSchema } from "@/lib/validations/appointment";
import { onAppointmentBooked } from "@/lib/automation-engine";
import { stopEnrollmentsForLead } from "@/lib/sequence-engine";
import { writeAuditLog } from "@/lib/audit";
import { EnrollmentStopReason } from "@/generated/prisma/enums";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const forbiddenResp = requireSalesFeatureApi(actor);
  if (forbiddenResp) return forbiddenResp;
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("leadId");

  const appointments = await prisma.appointment.findMany({
    where: { organizationId: actor.organization.id, ...(leadId ? { leadId } : {}) },
    include: { lead: true, owner: true },
    orderBy: { startAt: "asc" },
  });
  return NextResponse.json({ appointments });
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const forbiddenResp = requireSalesFeatureApi(actor);
  if (forbiddenResp) return forbiddenResp;
  const body = await request.json().catch(() => null);
  const parsed = appointmentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });

  const lead = await prisma.lead.findFirst({ where: { id: parsed.data.leadId, organizationId: actor.organization.id } });
  if (!lead) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });

  const appointment = await prisma.appointment.create({
    data: {
      organizationId: actor.organization.id,
      leadId: lead.id,
      title: parsed.data.title,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      location: parsed.data.location || undefined,
      notes: parsed.data.notes || undefined,
      ownerId: parsed.data.ownerId || actor.user.id,
    },
  });

  await onAppointmentBooked(lead.id, actor.organization.id);
  await stopEnrollmentsForLead(lead.id, EnrollmentStopReason.APPOINTMENT_BOOKED);

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    leadId: lead.id,
    action: "appointment.created",
    entityType: "Appointment",
    entityId: appointment.id,
  });

  return NextResponse.json({ appointment }, { status: 201 });
}
