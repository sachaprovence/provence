import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse, forbidden } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { navigationPresetSchema } from "@/lib/validations/navigation-preferences";
import { applyNavigationPreset } from "@/lib/navigation-preferences-service";
import type { CurrentActor } from "@/lib/auth";

async function resolveTargetUserId(actor: CurrentActor, requestedUserId: string | null | undefined): Promise<string | null> {
  if (!requestedUserId || requestedUserId === actor.user.id) return actor.user.id;
  if (actor.membership.role !== "OWNER_ADMIN") return null;
  const membership = await prisma.membership.findFirst({ where: { userId: requestedUserId, organizationId: actor.organization.id } });
  return membership ? requestedUserId : null;
}

/** Applique un préréglage ("Service pizzeria" / "Gestion complète") — un simple raccourci qui modifie les préférences de navigation, jamais un nouveau système de rôles (voir navigation-preferences-service.ts). */
export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const body = await request.json().catch(() => null);
  const parsed = navigationPresetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  const targetUserId = await resolveTargetUserId(actor, parsed.data.userId);
  if (!targetUserId) return forbidden("Vous ne pouvez modifier que votre propre navigation, ou celle d'un membre si vous êtes administrateur.");

  try {
    const overrides = await applyNavigationPreset(targetUserId, actor.organization.id, parsed.data.preset);
    return NextResponse.json({ userId: targetUserId, overrides });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/settings/navigation/preset" });
  }
}
