import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { importAutomationDefinition } from "@/lib/automation/registry/automation-service";
import { importAutomationSchema } from "@/lib/validations/automation";

export async function POST(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_AUTOMATIONS");
    const body = await request.json().catch(() => ({}));
    const parsed = importAutomationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }
    const { automation, version } = await importAutomationDefinition(actor, { ...parsed.data, description: parsed.data.description ?? null });
    return NextResponse.json({ automation, version }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/automations/import" });
  }
}
