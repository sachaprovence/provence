import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { registerBuiltInAutomationComponents } from "@/lib/automation/bootstrap";
import { listAutomationTriggerTypes } from "@/lib/automation/triggers";
import { listAutomationJobHandlers } from "@/lib/automation/actions";

/** Catalogue des déclencheurs/actions enregistrés — alimente la palette de l'éditeur d'automatisation. */
export async function GET(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    registerBuiltInAutomationComponents();
    const triggers = listAutomationTriggerTypes();
    const actions = listAutomationJobHandlers().map((a) => ({ key: a.key, name: a.name, description: a.description, category: a.category }));
    return NextResponse.json({ triggers, actions });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/automations/registry" });
  }
}
