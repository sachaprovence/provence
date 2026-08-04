import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { isAdmin } from "@/lib/permissions";
import { toApiErrorResponse } from "@/lib/errors";
import { getGmailAuthorizationUrl } from "@/lib/email/providers/gmail-oauth-flow";

/** Redirige vers l'écran de consentement OAuth Gmail (v0.9 bis, AR-0053). */
export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!isAdmin(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  try {
    const url = await getGmailAuthorizationUrl(actor.organization.id);
    return NextResponse.redirect(url);
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/email/gmail/connect" });
  }
}
