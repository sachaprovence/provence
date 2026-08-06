import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { disconnectWebhookIntegration, type WebhookConnectorKind } from "@/lib/integrations/connectors-service";

function parseKind(kind: string): WebhookConnectorKind | null {
  return kind === "SLACK" || kind === "DISCORD" ? kind : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");
    const { kind: rawKind } = await params;
    const kind = parseKind(rawKind.toUpperCase());
    if (!kind) return NextResponse.json({ error: "Connecteur inconnu." }, { status: 404 });

    const integration = await disconnectWebhookIntegration(actor, kind);
    return NextResponse.json({ integration });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/integrations/connectors/[kind]/disconnect" });
  }
}
