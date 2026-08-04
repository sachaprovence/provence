import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse, ValidationError } from "@/lib/errors";
import { createAgentRunSchema } from "@/lib/validations/agent";
import { resolveInstallationOrThrow } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { listRunsForInstallation } from "@/lib/agents/observability";
import { AgentInstallationStatus, AgentRunTrigger } from "@/generated/prisma/enums";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { id } = await params;
    await resolveInstallationOrThrow(actor, id);
    const runs = await listRunsForInstallation(id);
    return NextResponse.json({ runs });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/agents/installations/[id]/runs" });
  }
}

/**
 * Déclenche une exécution manuelle. En mode démo (pas de vraie file
 * distribuée, voir ADR 0008), on tente immédiatement le traitement après
 * création pour une expérience réactive — même principe que le bouton
 * "Traiter les relances maintenant" du moteur de séquences.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { id } = await params;
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");

    const installation = await resolveInstallationOrThrow(actor, id);
    if (installation.status !== AgentInstallationStatus.ACTIVE) {
      throw new ValidationError("L'agent doit être actif pour être exécuté.");
    }

    const body = await request.json().catch(() => ({}));
    const parsed = createAgentRunSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const run = await createAgentRun({
      installationId: id,
      input: parsed.data.input,
      trigger: AgentRunTrigger.MANUAL,
      priority: parsed.data.priority,
      maxAttempts: parsed.data.maxAttempts,
      timeoutMs: parsed.data.timeoutMs,
      createdById: actor.user.id,
    });

    await executeAgentRun(run.id);
    const refreshed = await listRunsForInstallation(id, 1);

    return NextResponse.json({ run: refreshed[0] ?? run }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/agents/installations/[id]/runs" });
  }
}
