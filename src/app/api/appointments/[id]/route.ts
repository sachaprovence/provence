import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse, requireSalesFeatureApi } from "@/lib/api-helpers";
import { appointmentUpdateSchema } from "@/lib/validations/appointment";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const forbiddenResp = requireSalesFeatureApi(actor);
  if (forbiddenResp) return forbiddenResp;
  const { id } = await params;
  const existing = await prisma.appointment.findFirst({ where: { id, organizationId: actor.organization.id } });
  if (!existing) return NextResponse.json({ error: "Rendez-vous introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = appointmentUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const { leadId: _leadId, ...rest } = parsed.data;
  const appointment = await prisma.appointment.update({ where: { id }, data: rest });
  return NextResponse.json({ appointment });
}
