import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { sendQuote, getQuote } from "@/lib/crm/quote-service";

const updateSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"]).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const quote = await getQuote(actor.organization.id, id);
    return NextResponse.json({ quote });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/quotes/[id]" });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;
  const existing = await prisma.quote.findFirst({ where: { id, organizationId: actor.organization.id } });
  if (!existing) return NextResponse.json({ error: "Devis introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  try {
    // Le passage à SENT fige un instantané versionné (voir `quote-service.ts`) — jamais un simple UPDATE.
    if (parsed.data.status === "SENT") {
      const quote = await sendQuote(actor.organization.id, id, actor.user.id);
      return NextResponse.json({ quote });
    }

    const quote = await prisma.quote.update({
      where: { id },
      data: {
        status: parsed.data.status,
        acceptedAt: parsed.data.status === "ACCEPTED" ? new Date() : undefined,
      },
    });

    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      leadId: existing.leadId,
      action: "quote.status_changed",
      entityType: "Quote",
      entityId: id,
      metadata: { status: parsed.data.status },
    });

    return NextResponse.json({ quote });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PATCH /api/quotes/[id]" });
  }
}
