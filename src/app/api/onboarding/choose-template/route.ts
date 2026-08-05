import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceActorApi, isWorkspaceActorResponse } from "@/lib/workspace-context";
import { chooseOnboardingTemplate } from "@/lib/onboarding/onboarding-service";
import { toApiErrorResponse } from "@/lib/errors";

const bodySchema = z.object({ templateKey: z.string().min(1) });

export async function POST(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });

    const progress = await chooseOnboardingTemplate(actor, parsed.data.templateKey);
    return NextResponse.json({ progress });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/onboarding/choose-template" });
  }
}
