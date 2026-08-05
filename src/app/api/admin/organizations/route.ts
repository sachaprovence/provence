import { NextResponse } from "next/server";
import { requirePlatformAdminApi, isPlatformAdminActorResponse } from "@/lib/platform-admin";
import { listOrganizationsForAdmin } from "@/lib/admin/admin-service";
import { toApiErrorResponse } from "@/lib/errors";

export async function GET(request: Request) {
  const actor = await requirePlatformAdminApi();
  if (isPlatformAdminActorResponse(actor)) return actor;

  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? undefined;
    const organizations = await listOrganizationsForAdmin({ search });
    return NextResponse.json({ organizations });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/admin/organizations" });
  }
}
