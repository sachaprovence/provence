import { NextResponse } from "next/server";
import { requirePlatformAdminApi, isPlatformAdminActorResponse } from "@/lib/platform-admin";
import { getOrganizationDetailForAdmin } from "@/lib/admin/admin-service";
import { toApiErrorResponse } from "@/lib/errors";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requirePlatformAdminApi();
  if (isPlatformAdminActorResponse(actor)) return actor;

  try {
    const { id } = await params;
    const organization = await getOrganizationDetailForAdmin(id);
    return NextResponse.json({ organization });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/admin/organizations/[id]" });
  }
}
