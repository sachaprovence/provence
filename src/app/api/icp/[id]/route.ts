import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse, requireSalesFeatureApi } from "@/lib/api-helpers";
import { icpSchema } from "@/lib/validations/icp";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const forbiddenResp = requireSalesFeatureApi(actor);
  if (forbiddenResp) return forbiddenResp;
  const { id } = await params;

  const existing = await prisma.idealCustomerProfile.findFirst({ where: { id, organizationId: actor.organization.id } });
  if (!existing) return NextResponse.json({ error: "Profil introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = icpSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const icp = await prisma.idealCustomerProfile.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ icp });
}

export async function DELETE(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const forbiddenResp = requireSalesFeatureApi(actor);
  if (forbiddenResp) return forbiddenResp;
  const { id } = await params;

  const existing = await prisma.idealCustomerProfile.findFirst({ where: { id, organizationId: actor.organization.id } });
  if (!existing) return NextResponse.json({ error: "Profil introuvable." }, { status: 404 });

  await prisma.idealCustomerProfile.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
