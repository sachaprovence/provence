import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { connectWebhookIntegration, type WebhookConnectorKind } from "@/lib/integrations/connectors-service";
import { connectWebhookSchema } from "@/lib/validations/connectors";

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

    const body = await request.json().catch(() => ({}));
    const parsed = connectWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }
    const integration = await connectWebhookIntegration(actor, kind, parsed.data.webhookUrl);
    return NextResponse.json({ integration });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/integrations/connectors/[kind]/connect" });
  }
}
