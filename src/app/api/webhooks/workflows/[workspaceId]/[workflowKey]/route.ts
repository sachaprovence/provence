import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toApiErrorResponse, ForbiddenError } from "@/lib/errors";
import { triggerWorkflowWebhook } from "@/lib/workflows/trigger-engine";
import { timingSafeStringEqual } from "@/lib/security/webhook-secret";

/**
 * Point d'entrée webhook générique (voir brief v0.6 : déclencheur
 * "Webhook"). Pas d'acteur authentifié (appelant externe) — l'isolation
 * repose sur la combinaison `workspaceId` + `workflowKey` + un secret
 * TOUJOURS configuré sur le noeud déclencheur (`config.secret`, vérifié à
 * temps constant via l'en-tête `X-Webhook-Secret`). Le secret est
 * désormais généré automatiquement à la (ré)indexation du déclencheur
 * (v0.10, AR-0156, voir `ensureWebhookTriggerConfig`) — corrige une faille
 * réelle : il était auparavant optionnel (voir ADR 0019 pour l'historique
 * de la limite maintenant corrigée).
 */
export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string; workflowKey: string }> }) {
  try {
    const { workspaceId, workflowKey } = await params;

    const binding = await prisma.workflowTriggerBinding.findFirst({
      where: { workspaceId, triggerKey: "webhook.received", isActive: true, workflowDefinition: { key: workflowKey } },
    });
    if (binding) {
      const configuredSecret = (binding.config as { secret?: string } | null)?.secret;
      const provided = request.headers.get("x-webhook-secret");
      if (!configuredSecret || !provided || !timingSafeStringEqual(provided, configuredSecret)) {
        throw new ForbiddenError("Secret webhook invalide.");
      }
    }

    const payload = await request.json().catch(() => ({}));
    const result = await triggerWorkflowWebhook(workspaceId, workflowKey, payload);
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/webhooks/workflows/[workspaceId]/[workflowKey]" });
  }
}
