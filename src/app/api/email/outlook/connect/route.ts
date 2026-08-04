import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { isAdmin } from "@/lib/permissions";
import { toApiErrorResponse } from "@/lib/errors";
import { getOutlookAuthorizationUrl } from "@/lib/email/providers/outlook-oauth-flow";

/** Redirige vers l'écran de consentement OAuth Microsoft (v0.9 bis, AR-0054). */
export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!isAdmin(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  try {
    const url = await getOutlookAuthorizationUrl(actor.organization.id);
    return NextResponse.redirect(url);
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/email/outlook/connect" });
  }
}
