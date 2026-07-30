import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { activateVersion } from "@/lib/workflows/workflow-service";
import { activateVersionSchema } from "@/lib/validations/workflow";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKFLOWS");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = activateVersionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }
    const definition = await activateVersion(actor, id, parsed.data.versionId);
    return NextResponse.json({ definition });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/workflows/[id]/activate" });
  }
}
