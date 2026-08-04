import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { isAdmin } from "@/lib/permissions";
import { deleteTag } from "@/lib/crm/tag-service";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!isAdmin(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const { id } = await params;

  try {
    await deleteTag(actor.organization.id, id);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "tag.deleted",
      entityType: "Tag",
      entityId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, { route: "DELETE /api/tags/[id]" });
  }
}
