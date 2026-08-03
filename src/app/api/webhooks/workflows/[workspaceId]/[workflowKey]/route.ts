import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toApiErrorResponse, ForbiddenError } from "@/lib/errors";
import { triggerWorkflowWebhook } from "@/lib/workflows/trigger-engine";

/**
 * Point d'entrée webhook générique (voir brief v0.6 : déclencheur
 * "Webhook"). Pas d'acteur authentifié (appelant externe) — l'isolation
 * repose sur la combinaison `workspaceId` + `workflowKey` + un secret
 * optionnel configuré sur le noeud déclencheur (`config.secret`, vérifié
 * via l'en-tête `X-Webhook-Secret`) : voir ADR 0019 pour les limites
 * connues de ce mécanisme (pas de signature HMAC à ce stade).
 */
export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string; workflowKey: string }> }) {
  try {
    const { workspaceId, workflowKey } = await params;

    const binding = await prisma.workflowTriggerBinding.findFirst({
      where: { workspaceId, triggerKey: "webhook.received", isActive: true, workflowDefinition: { key: workflowKey } },
    });
    const configuredSecret = (binding?.config as { secret?: string } | null)?.secret;
    if (configuredSecret) {
      const provided = request.headers.get("x-webhook-secret");
      if (provided !== configuredSecret) throw new ForbiddenError("Secret webhook invalide.");
    }

    const payload = await request.json().catch(() => ({}));
    const result = await triggerWorkflowWebhook(workspaceId, workflowKey, payload);
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/webhooks/workflows/[workspaceId]/[workflowKey]" });
  }
}
