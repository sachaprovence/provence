import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { runTool } from "@/lib/agents/custom/custom-agent-service";
import { runToolSchema } from "@/lib/validations/custom-agent";

/** Exécution explicite d'un outil autorisé pour cet agent, depuis l'UI de chat. */
export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const { conversationId } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = runToolSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }
    const result = await runTool(actor, conversationId, parsed.data.toolKey, parsed.data.input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/custom-agent-conversations/[conversationId]/tool-runs" });
  }
}
