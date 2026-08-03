import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toApiErrorResponse, ForbiddenError } from "@/lib/errors";
import { fireAutomationWebhook } from "@/lib/automation/trigger-engine";

/**
 * Point d'entrée webhook générique (voir brief v0.8 : déclencheur
 * "Webhook"). Pas d'acteur authentifié (appelant externe) — l'isolation
 * repose sur la combinaison `workspaceId` + `automationKey` + un secret
 * optionnel configuré sur le noeud déclencheur (`config.secret`, vérifié
 * via l'en-tête `X-Webhook-Secret`) — même mécanisme et mêmes limites
 * connues que `POST /api/webhooks/workflows/[workspaceId]/[workflowKey]`
 * (v0.6, voir ADR 0019).
 */
export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string; automationKey: string }> }) {
  try {
    const { workspaceId, automationKey } = await params;

    const binding = await prisma.automationTriggerBinding.findFirst({
      where: { workspaceId, triggerKey: "webhook.received", isActive: true, automation: { key: automationKey } },
    });
    const configuredSecret = (binding?.config as { secret?: string } | null)?.secret;
    if (configuredSecret) {
      const provided = request.headers.get("x-webhook-secret");
      if (provided !== configuredSecret) throw new ForbiddenError("Secret webhook invalide.");
    }

    const payload = await request.json().catch(() => ({}));
    const run = await fireAutomationWebhook(workspaceId, automationKey, payload);
    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/webhooks/automations/[workspaceId]/[automationKey]" });
  }
}
