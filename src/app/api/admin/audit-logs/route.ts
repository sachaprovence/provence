import { NextResponse } from "next/server";
import { requirePlatformAdminApi, isPlatformAdminActorResponse } from "@/lib/platform-admin";
import { listAuditLogsForAdmin } from "@/lib/admin/admin-service";
import { toApiErrorResponse } from "@/lib/errors";

export async function GET(request: Request) {
  const actor = await requirePlatformAdminApi();
  if (isPlatformAdminActorResponse(actor)) return actor;

  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId") ?? undefined;
    const logs = await listAuditLogsForAdmin({ organizationId });
    return NextResponse.json({ logs });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/admin/audit-logs" });
  }
}
