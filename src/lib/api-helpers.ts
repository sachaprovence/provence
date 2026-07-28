import { NextResponse } from "next/server";
import { getCurrentActor, type CurrentActor } from "@/lib/auth";
import { MembershipRole } from "@/generated/prisma/enums";
import { canAccessSalesFeatures } from "@/lib/permissions";

export async function requireActorApi(): Promise<CurrentActor | NextResponse> {
  const actor = await getCurrentActor();
  if (!actor) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  return actor;
}

export function isActorResponse(value: CurrentActor | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

export function forbidden(message = "Accès refusé.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function requireRoleApi(actor: CurrentActor, roles: MembershipRole[]): NextResponse | null {
  if (!roles.includes(actor.membership.role)) {
    return forbidden();
  }
  return null;
}

/** Bloque les prestataires régionaux, dont l'accès est limité aux prospects/missions de leur territoire. */
export function requireSalesFeatureApi(actor: CurrentActor): NextResponse | null {
  if (!canAccessSalesFeatures(actor)) {
    return forbidden("Réservé aux commerciaux et administrateurs.");
  }
  return null;
}

export function zodErrorResponse(error: { message: string }) {
  return NextResponse.json({ error: "Données invalides.", details: error.message }, { status: 400 });
}
