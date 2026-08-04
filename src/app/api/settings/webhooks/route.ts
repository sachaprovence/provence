import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse, forbidden } from "@/lib/api-helpers";
import { canManageOrganization } from "@/lib/permissions";
import { listWebhookSubscriptions, createWebhookSubscription } from "@/lib/settings/webhook-subscriptions-service";
import { toApiErrorResponse } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageOrganization(actor)) return forbidden();

  const subscriptions = await listWebhookSubscriptions(actor.organization.id);
  return NextResponse.json({ subscriptions });
}

/** Crée une souscription — le secret HMAC n'est renvoyé qu'une seule fois, dans cette réponse. */
export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageOrganization(actor)) return forbidden();

  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url : "";
  const eventTypes = Array.isArray(body?.eventTypes) ? body.eventTypes.filter((e: unknown) => typeof e === "string") : [];

  try {
    const { secret, preview } = await createWebhookSubscription({ organizationId: actor.organization.id, url, eventTypes, createdById: actor.user.id });
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "webhook_subscription.created",
      entityType: "WebhookSubscription",
      entityId: preview.id,
      metadata: { url: preview.url, eventTypes: preview.eventTypes },
    });
    return NextResponse.json({ secret, subscription: preview }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/settings/webhooks" });
  }
}
