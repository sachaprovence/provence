import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { nextActionContextSchema } from "@/lib/validations/quest";
import { getNextBestActionForUser } from "@/lib/quest/quest-service";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { searchParams } = new URL(request.url);
  const parsed = nextActionContextSchema.safeParse({
    availableMinutes: searchParams.get("availableMinutes") ?? undefined,
    energy: searchParams.get("energy") ?? undefined,
    context: searchParams.get("context") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await getNextBestActionForUser(actor.user.id, parsed.data);
    return NextResponse.json({ result });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/quest/next-action" });
  }
}
