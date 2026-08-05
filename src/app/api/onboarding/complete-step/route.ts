import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { completeOnboardingStep } from "@/lib/onboarding/onboarding-service";
import { toApiErrorResponse } from "@/lib/errors";
import { OnboardingStepKey } from "@/generated/prisma/enums";

const bodySchema = z.object({ step: z.nativeEnum(OnboardingStepKey) });

/** Marque une étape de l'onboarding comme terminée — utilisé par PROFILE, INVITE_TEAM, CONNECT_TOOL (étapes sans action serveur dédiée). */
export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });

    const progress = await completeOnboardingStep(actor.organization.id, parsed.data.step);
    return NextResponse.json({ progress });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/onboarding/complete-step" });
  }
}
