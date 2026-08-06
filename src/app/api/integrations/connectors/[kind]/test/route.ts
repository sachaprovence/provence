import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { testWebhookIntegration, type WebhookConnectorKind } from "@/lib/integrations/connectors-service";

function parseKind(kind: string): WebhookConnectorKind | null {
  return kind === "SLACK" || kind === "DISCORD" ? kind : null;
}

/** Envoi réel best-effort d'un message de test au webhook configuré — limité (5/5min) au même titre que les autres diagnostics (voir `src/app/api/settings/integrations/diagnostics/test`). */
export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");
    const { kind: rawKind } = await params;
    const kind = parseKind(rawKind.toUpperCase());
    if (!kind) return NextResponse.json({ error: "Connecteur inconnu." }, { status: 404 });

    const result = await testWebhookIntegration(actor, kind);
    return NextResponse.json(result);
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/integrations/connectors/[kind]/test" });
  }
}
