import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { createQuickSale } from "@/lib/compta/sale-service";
import { canManageComptaOperations, comptaForbiddenResponse } from "@/lib/compta/permissions";

const quickSaleSchema = z.object({ productId: z.string() });

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaOperations(actor.membership.role)) return comptaForbiddenResponse();
  const body = await request.json().catch(() => null);
  const parsed = quickSaleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const sale = await createQuickSale(actor.organization.id, parsed.data.productId, actor.user.id);
    return NextResponse.json({ sale }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/compta/sales/quick" });
  }
}
