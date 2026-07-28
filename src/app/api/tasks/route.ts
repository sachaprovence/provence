import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse, requireSalesFeatureApi } from "@/lib/api-helpers";

const taskSchema = z.object({
  leadId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  title: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  dueAt: z.coerce.date().optional().nullable(),
});

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const forbiddenResp = requireSalesFeatureApi(actor);
  if (forbiddenResp) return forbiddenResp;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const mine = searchParams.get("mine");

  const tasks = await prisma.task.findMany({
    where: {
      organizationId: actor.organization.id,
      ...(status ? { status: status as never } : {}),
      ...(mine === "true" ? { assigneeId: actor.user.id } : {}),
    },
    include: { lead: true, assignee: true },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
  });
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const forbiddenResp = requireSalesFeatureApi(actor);
  if (forbiddenResp) return forbiddenResp;
  const body = await request.json().catch(() => null);
  const parsed = taskSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const task = await prisma.task.create({
    data: { organizationId: actor.organization.id, ...parsed.data },
  });
  return NextResponse.json({ task }, { status: 201 });
}
