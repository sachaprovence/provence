import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse, forbidden } from "@/lib/api-helpers";
import { canManageOrganization } from "@/lib/permissions";
import { deleteWebhookSubscription } from "@/lib/settings/webhook-subscriptions-service";
import { toApiErrorResponse } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageOrganization(actor)) return forbidden();

  const { id } = await params;
  try {
    await deleteWebhookSubscription(actor.organization.id, id);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "webhook_subscription.deleted",
      entityType: "WebhookSubscription",
      entityId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, { route: "DELETE /api/settings/webhooks/[id]" });
  }
}
