import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { listAutomationsForWorkspace, createAutomationDefinition } from "@/lib/automation/registry/automation-service";
import { createAutomationSchema } from "@/lib/validations/automation";

/** Liste les automatisations du workspace (option `?templates=1` pour inclure le catalogue de templates globaux) et permet d'en créer une nouvelle (toujours `DRAFT`). */
export async function GET(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const includeTemplates = new URL(request.url).searchParams.get("templates") === "1";
    const automations = await listAutomationsForWorkspace(actor.workspace.id, { includeTemplates });
    return NextResponse.json({ automations });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/automations" });
  }
}

export async function POST(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_AUTOMATIONS");
    const body = await request.json().catch(() => ({}));
    const parsed = createAutomationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }
    const { automation, version } = await createAutomationDefinition(actor, parsed.data);
    return NextResponse.json({ automation, version }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/automations" });
  }
}
