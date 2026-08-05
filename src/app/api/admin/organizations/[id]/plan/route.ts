import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdminApi, isPlatformAdminActorResponse } from "@/lib/platform-admin";
import { changeOrganizationPlanAsAdmin } from "@/lib/admin/admin-service";
import { toApiErrorResponse } from "@/lib/errors";
import { PlanKey } from "@/generated/prisma/enums";

type Params = { params: Promise<{ id: string }> };
const bodySchema = z.object({ planKey: z.nativeEnum(PlanKey) });

/** Changement manuel de plan par un administrateur plateforme (v1.4, AR-0185) — jamais accessible à un administrateur d'organisation. */
export async function POST(request: Request, { params }: Params) {
  const actor = await requirePlatformAdminApi();
  if (isPlatformAdminActorResponse(actor)) return actor;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });

    const organization = await changeOrganizationPlanAsAdmin(actor, id, parsed.data.planKey);
    return NextResponse.json({ organization });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/admin/organizations/[id]/plan" });
  }
}
