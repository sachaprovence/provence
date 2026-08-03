import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { completeGoogleOAuthFlow } from "@/lib/calendar/google";
import { logger } from "@/lib/logger";

/**
 * Retour du flux OAuth Google (brief v0.9) — `state` porte l'organizationId
 * envoyé lors de la redirection initiale, vérifié contre l'acteur courant
 * (protection CSRF minimale : seul l'acteur qui a initié le flux, dans la
 * même session navigateur, peut le terminer).
 */
export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/settings?calendar=error&reason=${encodeURIComponent(error)}`, request.url));
  }
  if (!code || state !== actor.organization.id) {
    return NextResponse.redirect(new URL("/settings?calendar=error&reason=invalid_state", request.url));
  }

  try {
    await completeGoogleOAuthFlow(actor.organization.id, code);
    return NextResponse.redirect(new URL("/settings?calendar=connected", request.url));
  } catch (err) {
    logger.warn({ err, organizationId: actor.organization.id }, "Échec de la finalisation du flux OAuth Google Calendar.");
    return NextResponse.redirect(new URL("/settings?calendar=error", request.url));
  }
}
