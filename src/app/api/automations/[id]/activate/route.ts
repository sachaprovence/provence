import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { activateAutomationVersion } from "@/lib/automation/registry/automation-service";
import { activateAutomationVersionSchema } from "@/lib/validations/automation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_AUTOMATIONS");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = activateAutomationVersionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }
    const automation = await activateAutomationVersion(actor, id, parsed.data.versionId);
    return NextResponse.json({ automation });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/automations/[id]/activate" });
  }
}
