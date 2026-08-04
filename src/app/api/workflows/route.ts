import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { listDefinitionsForWorkspace, createWorkflowDefinition } from "@/lib/workflows/workflow-service";
import { createWorkflowSchema } from "@/lib/validations/workflow";

/** Liste les workflows du workspace (option `?templates=1` pour inclure le catalogue de templates globaux) et permet d'en créer un nouveau (toujours `DRAFT`). */
export async function GET(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const includeTemplates = new URL(request.url).searchParams.get("templates") === "1";
    const definitions = await listDefinitionsForWorkspace(actor.workspace.id, { includeTemplates });
    return NextResponse.json({ definitions });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/workflows" });
  }
}

export async function POST(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKFLOWS");
    const body = await request.json().catch(() => ({}));
    const parsed = createWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }
    const { definition, version } = await createWorkflowDefinition(actor, parsed.data);
    return NextResponse.json({ definition, version }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/workflows" });
  }
}
