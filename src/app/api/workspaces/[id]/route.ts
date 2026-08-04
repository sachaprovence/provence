import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { updateWorkspaceSchema } from "@/lib/validations/workspace";
import { resolveWorkspaceOrThrow, updateWorkspace } from "@/lib/workspace-service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { id } = await params;
    // `id` provient de l'URL (client) : jamais utilisé sans re-vérification
    // de l'appartenance à l'organisation courante (voir ADR 0005).
    const workspace = await resolveWorkspaceOrThrow(actor, id);
    return NextResponse.json({ workspace });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/workspaces/[id]" });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { id } = await params;
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");

    const body = await request.json().catch(() => null);
    const parsed = updateWorkspaceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const workspace = await updateWorkspace(actor, id, parsed.data);
    return NextResponse.json({ workspace });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PATCH /api/workspaces/[id]" });
  }
}
