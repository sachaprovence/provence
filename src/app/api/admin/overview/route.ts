import { NextResponse } from "next/server";
import { requirePlatformAdminApi, isPlatformAdminActorResponse } from "@/lib/platform-admin";
import { getPlatformOverview, getGlobalErrorSummary } from "@/lib/admin/admin-service";
import { toApiErrorResponse } from "@/lib/errors";

export async function GET(request: Request) {
  const actor = await requirePlatformAdminApi();
  if (isPlatformAdminActorResponse(actor)) return actor;

  try {
    const [overview, errors] = await Promise.all([getPlatformOverview(), getGlobalErrorSummary()]);
    return NextResponse.json({ overview, errors });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/admin/overview" });
  }
}
