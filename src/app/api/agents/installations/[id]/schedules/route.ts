import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { resolveInstallationOrThrow } from "@/lib/agents/installation-service";
import { createSchedule } from "@/lib/agents/scheduler";
import { createAgentScheduleSchema } from "@/lib/validations/agent";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { id } = await params;
    await resolveInstallationOrThrow(actor, id);
    const schedules = await prisma.agentSchedule.findMany({ where: { installationId: id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ schedules });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/agents/installations/[id]/schedules" });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { id } = await params;
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");
    await resolveInstallationOrThrow(actor, id);

    const body = await request.json().catch(() => null);
    const parsed = createAgentScheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const schedule = await createSchedule({ installationId: id, ...parsed.data });
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/agents/installations/[id]/schedules" });
  }
}
