import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { completeOutlookOAuthFlow } from "@/lib/email/providers/outlook-oauth-flow";
import { logger } from "@/lib/logger";

/**
 * Retour du flux OAuth Microsoft (v0.9 bis, AR-0054) — `state` porte
 * l'organizationId envoyé lors de la redirection initiale, vérifié contre
 * l'acteur courant (même protection CSRF minimale que Google Calendar/Gmail).
 */
export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/settings?email=error&reason=${encodeURIComponent(error)}`, request.url));
  }
  if (!code || state !== actor.organization.id) {
    return NextResponse.redirect(new URL("/settings?email=error&reason=invalid_state", request.url));
  }

  try {
    await completeOutlookOAuthFlow(actor.organization.id, code);
    return NextResponse.redirect(new URL("/settings?email=connected", request.url));
  } catch (err) {
    logger.warn({ err, organizationId: actor.organization.id }, "Échec de la finalisation du flux OAuth Outlook.");
    return NextResponse.redirect(new URL("/settings?email=error", request.url));
  }
}
