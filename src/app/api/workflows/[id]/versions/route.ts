import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { createNewVersion } from "@/lib/workflows/workflow-service";
import { createVersionSchema } from "@/lib/validations/workflow";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKFLOWS");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = createVersionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }
    const version = await createNewVersion(actor, id, parsed.data);
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/workflows/[id]/versions" });
  }
}
