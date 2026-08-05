import { NextResponse } from "next/server";
import { requirePlatformAdminApi, isPlatformAdminActorResponse } from "@/lib/platform-admin";
import { suspendOrganizationAsAdmin } from "@/lib/admin/admin-service";
import { toApiErrorResponse } from "@/lib/errors";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const actor = await requirePlatformAdminApi();
  if (isPlatformAdminActorResponse(actor)) return actor;

  try {
    const { id } = await params;
    const organization = await suspendOrganizationAsAdmin(actor, id);
    return NextResponse.json({ organization });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/admin/organizations/[id]/suspend" });
  }
}
