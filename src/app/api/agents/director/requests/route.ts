import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse, ValidationError } from "@/lib/errors";
import { directorRunRequestSchema } from "@/lib/validations/director";
import { resolveDirectorInstallation } from "@/lib/agents/director/dashboard-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { AgentInstallationStatus, AgentRunTrigger } from "@/generated/prisma/enums";

/**
 * Soumet une nouvelle demande au Director. Même principe que
 * `POST /api/agents/installations/[id]/runs` (v0.3) : création + tentative
 * d'exécution immédiate pour une expérience réactive (pas de file
 * distribuée, voir ADR 0008/0010). La demande transite entièrement par le
 * moteur d'exécution du Framework Agents — ni raccourci, ni exécution
 * directe du runtime en dehors de `executeAgentRun`.
 */
export async function POST(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");

    const director = await resolveDirectorInstallation(actor.workspace.id);
    if (!director) {
      throw new ValidationError("L'Agent Director n'est pas installé dans ce workspace.");
    }
    if (director.status !== AgentInstallationStatus.ACTIVE) {
      throw new ValidationError("L'Agent Director doit être actif pour recevoir une demande.");
    }

    const body = await request.json().catch(() => ({}));
    const parsed = directorRunRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const run = await createAgentRun({
      installationId: director.id,
      input: { objective: parsed.data.objective, steps: parsed.data.steps },
      trigger: AgentRunTrigger.MANUAL,
      priority: parsed.data.priority,
      maxAttempts: parsed.data.maxAttempts,
      timeoutMs: parsed.data.timeoutMs,
      createdById: actor.user.id,
    });

    await executeAgentRun(run.id);

    const [finishedRun, plan] = await Promise.all([
      prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } }),
      prisma.agentPlan.findUnique({ where: { runId: run.id }, include: { steps: { orderBy: { stepIndex: "asc" } } } }),
    ]);

    return NextResponse.json({ run: finishedRun, plan }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/agents/director/requests" });
  }
}
