import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { notificationPreferencesUpdateSchema } from "@/lib/validations/notification-preferences";
import { getNotificationPreferences, updateNotificationPreferences } from "@/lib/settings/notification-preferences-service";

/** Réglages PAR UTILISATEUR (v1.1, AR-0180) — chaque utilisateur gère ses propres préférences, aucune restriction de rôle au-delà de l'authentification. */
export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const preferences = await getNotificationPreferences(actor.user.id);
    return NextResponse.json({ preferences });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/settings/notification-preferences" });
  }
}

export async function PUT(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  const body = await request.json().catch(() => null);
  const parsed = notificationPreferencesUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const preferences = await updateNotificationPreferences(actor.organization.id, actor.user.id, parsed.data.preferences);
    return NextResponse.json({ preferences });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PUT /api/settings/notification-preferences" });
  }
}
