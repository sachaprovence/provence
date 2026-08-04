import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse, ValidationError } from "@/lib/errors";
import { commercialAgentInputSchema } from "@/lib/validations/commercial";
import { resolveCommercialInstallation } from "@/lib/agents/commercial/commercial-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { AgentInstallationStatus, AgentRunTrigger } from "@/generated/prisma/enums";
import { z } from "zod";

const runParamsSchema = z.object({
  priority: z.coerce.number().int().min(0).max(10).optional(),
  maxAttempts: z.coerce.number().int().min(1).max(10).optional(),
  timeoutMs: z.coerce.number().int().min(1000).max(10 * 60 * 1000).optional(),
});

/**
 * Soumet une demande à l'Agent Commercial — même principe que
 * `POST /api/agents/director/requests` (v0.4) : création + exécution
 * immédiate du run pour une expérience réactive, entièrement via le moteur
 * d'exécution du Framework (aucun raccourci).
 */
export async function POST(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_LEADS");

    const commercial = await resolveCommercialInstallation(actor.workspace.id);
    if (!commercial) throw new ValidationError("L'Agent Commercial n'est pas installé dans ce workspace.");
    if (commercial.status !== AgentInstallationStatus.ACTIVE) {
      throw new ValidationError("L'Agent Commercial doit être actif pour recevoir une demande.");
    }

    const body = await request.json().catch(() => ({}));
    const parsedInput = commercialAgentInputSchema.safeParse(body);
    if (!parsedInput.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsedInput.error.flatten() }, { status: 400 });
    }
    const runParams = runParamsSchema.parse(body);

    const run = await createAgentRun({
      installationId: commercial.id,
      input: parsedInput.data,
      trigger: AgentRunTrigger.MANUAL,
      priority: runParams.priority,
      maxAttempts: runParams.maxAttempts,
      timeoutMs: runParams.timeoutMs,
      createdById: actor.user.id,
    });

    await executeAgentRun(run.id);
    const finishedRun = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });

    return NextResponse.json({ run: finishedRun }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/commercial/requests" });
  }
}
