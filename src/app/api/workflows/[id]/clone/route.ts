import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { cloneWorkflowDefinition } from "@/lib/workflows/workflow-service";
import { cloneWorkflowSchema } from "@/lib/validations/workflow";

/** Clone un workflow existant OU un template global (voir `resolveDefinitionForActor`, qui autorise aussi les templates) dans le workspace de l'acteur. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKFLOWS");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = cloneWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }
    const { definition, version } = await cloneWorkflowDefinition(actor, id, parsed.data);
    return NextResponse.json({ definition, version }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/workflows/[id]/clone" });
  }
}
