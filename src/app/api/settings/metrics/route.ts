import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { isAdmin } from "@/lib/permissions";
import { getObservabilityMetrics, getRecentApiErrors } from "@/lib/observability/metrics-service";

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!isAdmin(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const [metrics, recentErrors] = await Promise.all([
    getObservabilityMetrics(actor.organization.id),
    getRecentApiErrors(actor.organization.id),
  ]);
  return NextResponse.json({ metrics, recentErrors });
}
