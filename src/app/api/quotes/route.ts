import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { quoteSchema } from "@/lib/validations/quote";
import { createQuote } from "@/lib/crm/quote-service";
import { writeAuditLog } from "@/lib/audit";
import { withApiMetrics } from "@/lib/observability/api-metrics";

async function handleGet(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("leadId");

  const quotes = await prisma.quote.findMany({
    where: { organizationId: actor.organization.id, ...(leadId ? { leadId } : {}) },
    include: { lines: true, lead: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ quotes });
}

async function handlePost(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const body = await request.json().catch(() => null);
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });

  try {
    const quote = await createQuote(actor.organization.id, parsed.data);

    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      leadId: quote.leadId,
      action: "quote.created",
      entityType: "Quote",
      entityId: quote.id,
      metadata: { totalAmount: quote.totalAmount },
    });

    return NextResponse.json({ quote }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/quotes" });
  }
}

// Routes représentatives instrumentées pour la latence API (AR-0049, v0.9 bis) — voir src/lib/observability/api-metrics.ts.
export const GET = withApiMetrics("GET /api/quotes", handleGet);
export const POST = withApiMetrics("POST /api/quotes", handlePost);
