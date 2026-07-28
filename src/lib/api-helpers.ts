import { NextResponse } from "next/server";
import { getCurrentActor, type CurrentActor } from "@/lib/auth";
import { MembershipRole } from "@/generated/prisma/enums";

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

export function zodErrorResponse(error: { message: string }) {
  return NextResponse.json({ error: "Données invalides.", details: error.message }, { status: 400 });
}
