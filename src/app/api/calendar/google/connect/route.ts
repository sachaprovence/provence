import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { isAdmin } from "@/lib/permissions";
import { toApiErrorResponse } from "@/lib/errors";
import { getGoogleAuthorizationUrl } from "@/lib/calendar/google";

/** Redirige vers l'écran de consentement OAuth Google (brief v0.9 : "Créer l'intégration"). */
export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!isAdmin(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  try {
    const url = await getGoogleAuthorizationUrl(actor.organization.id);
    return NextResponse.redirect(url);
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/calendar/google/connect" });
  }
}
