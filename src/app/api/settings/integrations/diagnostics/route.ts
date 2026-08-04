import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse, forbidden } from "@/lib/api-helpers";
import { isAdmin } from "@/lib/permissions";
import { toApiErrorResponse } from "@/lib/errors";
import { listIntegrationDiagnostics } from "@/lib/diagnostics/integration-diagnostics-service";

/**
 * `GET /api/settings/integrations/diagnostics` (v1.2, AR-0165) — état de
 * configuration/connexion de Stripe/Twilio/Gmail/Outlook/S3, réservé à
 * l'administrateur de l'organisation. Ne renvoie jamais aucun secret : voir
 * `src/lib/diagnostics/types.ts#IntegrationDiagnosticSummary`.
 */
export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!isAdmin(actor)) return forbidden();

  try {
    const diagnostics = await listIntegrationDiagnostics(actor.organization.id);
    return NextResponse.json({ diagnostics });
  } catch (error) {
    return toApiErrorResponse(error, { organizationId: actor.organization.id, route: "settings/integrations/diagnostics" });
  }
}
