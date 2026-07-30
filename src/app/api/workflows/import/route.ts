import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { importWorkflowDefinition } from "@/lib/workflows/workflow-service";
import { importWorkflowSchema } from "@/lib/validations/workflow";

export async function POST(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKFLOWS");
    const body = await request.json().catch(() => ({}));
    const parsed = importWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }
    const { definition, version } = await importWorkflowDefinition(actor, { ...parsed.data, description: parsed.data.description ?? null });
    return NextResponse.json({ definition, version }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/workflows/import" });
  }
}
