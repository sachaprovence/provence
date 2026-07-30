import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { createNewAutomationVersion } from "@/lib/automation/registry/automation-service";
import { createAutomationVersionSchema } from "@/lib/validations/automation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_AUTOMATIONS");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = createAutomationVersionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }
    const version = await createNewAutomationVersion(actor, id, parsed.data);
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/automations/[id]/versions" });
  }
}
