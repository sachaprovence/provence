import "server-only";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentActor, type CurrentActor } from "@/lib/auth";
import { ForbiddenError } from "@/lib/errors";

/**
 * Garde d'accès à l'administration PLATEFORME (v1.4, AR-0185) — distinct de
 * tout rôle d'organisation/workspace : `User.isPlatformAdmin` est un
 * attribut de compte, jamais posé par l'application (voir
 * `scripts/promote-platform-admin.ts`). Deux variantes, même convention que
 * `requireActor`/`requireActorApi` (pages Server Component vs routes API).
 */
export async function requirePlatformAdminPage(): Promise<CurrentActor> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (!actor.isPlatformAdmin) redirect("/dashboard");
  return actor;
}

export async function requirePlatformAdminApi(): Promise<CurrentActor | NextResponse> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!actor.isPlatformAdmin) return NextResponse.json({ error: "Réservé aux administrateurs de la plateforme." }, { status: 403 });
  return actor;
}

export function isPlatformAdminActorResponse(value: CurrentActor | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

/** Variante qui lève (pour les fonctions de service appelées depuis un contexte déjà authentifié) plutôt que de renvoyer une réponse HTTP. */
export function assertPlatformAdmin(actor: CurrentActor): void {
  if (!actor.isPlatformAdmin) throw new ForbiddenError("Réservé aux administrateurs de la plateforme.");
}
