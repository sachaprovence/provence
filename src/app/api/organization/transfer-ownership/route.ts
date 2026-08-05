import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { transferOrganizationOwnership } from "@/lib/organization-service";
import { toApiErrorResponse } from "@/lib/errors";

const transferSchema = z.object({ toUserId: z.string().min(1) });

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  const body = await request.json().catch(() => null);
  const parsed = transferSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });

  try {
    const membership = await transferOrganizationOwnership(actor, parsed.data.toUserId);
    return NextResponse.json({ membership });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/organization/transfer-ownership" });
  }
}
