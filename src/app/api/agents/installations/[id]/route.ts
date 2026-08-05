import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import {
  resolveInstallationOrThrow,
  updateInstallationConfig,
  updateInstallationGrants,
} from "@/lib/agents/installation-service";
import { getInstallationStats } from "@/lib/agents/observability";
import { updateAgentConfigSchema, updateAgentGrantsSchema } from "@/lib/validations/agent";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { id } = await params;
    const installation = await resolveInstallationOrThrow(actor, id);
    const stats = await getInstallationStats(id);
    return NextResponse.json({ installation, stats });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/agents/installations/[id]" });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { id } = await params;
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");

    const body = await request.json().catch(() => null);

    const grantsParsed = updateAgentGrantsSchema.safeParse(body);
    if (grantsParsed.success) {
      const installation = await updateInstallationGrants(actor, id, grantsParsed.data);
      return NextResponse.json({ installation });
    }

    const configParsed = updateAgentConfigSchema.safeParse(body);
    if (configParsed.success) {
      const installation = await updateInstallationConfig(actor, id, configParsed.data.config);
      return NextResponse.json({ installation });
    }

    return NextResponse.json({ error: "Corps de requête invalide : fournir {toolKeys, permissions} ou {config}." }, { status: 400 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PATCH /api/agents/installations/[id]" });
  }
}
