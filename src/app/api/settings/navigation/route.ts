import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse, forbidden } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { navigationPreferencesUpdateSchema } from "@/lib/validations/navigation-preferences";
import { listNavigationOverrides, setNavigationPreferences } from "@/lib/navigation-preferences-service";
import type { CurrentActor } from "@/lib/auth";

/**
 * Navigation personnalisée : réglable pour soi-même par n'importe quel compte, ou pour un autre
 * membre de la même organisation par un administrateur uniquement (cas d'usage principal — ex.
 * configurer le compte d'un employé qui ne touchera jamais lui-même à cet écran). Masquer une
 * section reste un réglage d'affichage, jamais un changement de permission d'accès.
 */
async function resolveTargetUserId(actor: CurrentActor, requestedUserId: string | null | undefined): Promise<string | null> {
  if (!requestedUserId || requestedUserId === actor.user.id) return actor.user.id;
  if (actor.membership.role !== "OWNER_ADMIN") return null;
  const membership = await prisma.membership.findFirst({ where: { userId: requestedUserId, organizationId: actor.organization.id } });
  return membership ? requestedUserId : null;
}

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { searchParams } = new URL(request.url);
  const targetUserId = await resolveTargetUserId(actor, searchParams.get("userId"));
  if (!targetUserId) return forbidden("Vous ne pouvez consulter que votre propre navigation, ou celle d'un membre si vous êtes administrateur.");

  try {
    const overrides = await listNavigationOverrides(targetUserId, actor.organization.id);
    return NextResponse.json({ userId: targetUserId, overrides });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/settings/navigation" });
  }
}

export async function PATCH(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const body = await request.json().catch(() => null);
  const parsed = navigationPreferencesUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  const targetUserId = await resolveTargetUserId(actor, parsed.data.userId);
  if (!targetUserId) return forbidden("Vous ne pouvez modifier que votre propre navigation, ou celle d'un membre si vous êtes administrateur.");

  try {
    const overrides = await setNavigationPreferences(targetUserId, actor.organization.id, parsed.data.items);
    return NextResponse.json({ userId: targetUserId, overrides });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PATCH /api/settings/navigation" });
  }
}
