import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { installAgentSchema } from "@/lib/validations/agent";
import { listInstallations, installAgent } from "@/lib/agents/installation-service";

export async function GET() {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const installations = await listInstallations(actor);
    return NextResponse.json({ installations });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/agents/installations" });
  }
}

export async function POST(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");

    const body = await request.json().catch(() => null);
    const parsed = installAgentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const installation = await installAgent(actor, parsed.data);
    return NextResponse.json({ installation }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/agents/installations" });
  }
}
