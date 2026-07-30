import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { triggerManualAutomationRun } from "@/lib/automation/executor";
import { manualAutomationRunSchema } from "@/lib/validations/automation";

/** Déclenchement manuel ("Déclencheur manuel", voir `triggers/builtin-triggers.ts`) — asynchrone, voir ADR 0031. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_AUTOMATIONS");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = manualAutomationRunSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }
    const run = await triggerManualAutomationRun(actor, id, parsed.data.input);
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/automations/[id]/run" });
  }
}
