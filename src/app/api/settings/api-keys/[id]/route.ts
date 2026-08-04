import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse, forbidden } from "@/lib/api-helpers";
import { canManageOrganization } from "@/lib/permissions";
import { revokeApiKey } from "@/lib/settings/api-keys-service";
import { toApiErrorResponse } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageOrganization(actor)) return forbidden();

  const { id } = await params;
  try {
    await revokeApiKey(actor.organization.id, id);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "api_key.revoked",
      entityType: "ApiKey",
      entityId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "DELETE /api/settings/api-keys/[id]" });
  }
}
