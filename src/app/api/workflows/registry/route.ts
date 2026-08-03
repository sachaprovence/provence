import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { registerBuiltInWorkflowComponents } from "@/lib/workflows/bootstrap";
import { listTriggerTypes } from "@/lib/workflows/triggers/registry";
import { listWorkflowActions } from "@/lib/workflows/actions/registry";

/** Catalogue des déclencheurs/actions enregistrés — alimente la palette de l'éditeur de workflow (voir `components/workflow-editor.tsx`). */
export async function GET() {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    registerBuiltInWorkflowComponents();
    const triggers = listTriggerTypes();
    const actions = listWorkflowActions().map((a) => ({ key: a.key, name: a.name, description: a.description, category: a.category }));
    return NextResponse.json({ triggers, actions });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/workflows/registry" });
  }
}
