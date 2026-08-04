import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { cloneAutomationDefinition } from "@/lib/automation/registry/automation-service";
import { cloneAutomationSchema } from "@/lib/validations/automation";

/** Clone une automatisation existante OU un template global (voir `resolveAutomationForActor`, qui autorise aussi les templates) dans le workspace de l'acteur. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_AUTOMATIONS");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = cloneAutomationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }
    const { automation, version } = await cloneAutomationDefinition(actor, id, parsed.data);
    return NextResponse.json({ automation, version }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/automations/[id]/clone" });
  }
}
