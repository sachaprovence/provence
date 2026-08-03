import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { triggerManualRun } from "@/lib/workflows/workflow-service";
import { manualTriggerSchema } from "@/lib/validations/workflow";

/** Déclenchement manuel ("Action utilisateur", voir `triggers/builtin-triggers.ts`). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKFLOWS");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = manualTriggerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }
    const run = await triggerManualRun(actor, id, parsed.data.input);
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/workflows/[id]/run" });
  }
}
