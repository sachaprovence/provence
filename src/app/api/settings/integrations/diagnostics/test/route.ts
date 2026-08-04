import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActorApi, isActorResponse, forbidden, zodErrorResponse } from "@/lib/api-helpers";
import { isAdmin } from "@/lib/permissions";
import { toApiErrorResponse } from "@/lib/errors";
import { runIntegrationDiagnosticTest } from "@/lib/diagnostics/integration-diagnostics-service";
import { IntegrationDiagnosticKey } from "@/generated/prisma/enums";

const testRequestSchema = z.object({
  integration: z.enum([
    IntegrationDiagnosticKey.STRIPE,
    IntegrationDiagnosticKey.TWILIO,
    IntegrationDiagnosticKey.GMAIL,
    IntegrationDiagnosticKey.OUTLOOK,
    IntegrationDiagnosticKey.S3_STORAGE,
  ]),
});

/**
 * `POST /api/settings/integrations/diagnostics/test` (v1.2, AR-0165) —
 * déclenche un test de connexion réel contre l'intégration demandée,
 * réservé à l'administrateur, limité en débit et journalisé sans secret
 * (voir `runIntegrationDiagnosticTest`). Refuse explicitement si la
 * configuration est incomplète (jamais d'appel tiers avec des identifiants
 * partiels).
 */
export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!isAdmin(actor)) return forbidden();

  const body = await request.json().catch(() => null);
  const parsed = testRequestSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  try {
    const summary = await runIntegrationDiagnosticTest(actor.organization.id, parsed.data.integration, actor.user.id);
    return NextResponse.json({ diagnostic: summary });
  } catch (error) {
    return toApiErrorResponse(error, { organizationId: actor.organization.id, integration: parsed.data.integration, route: "settings/integrations/diagnostics/test" });
  }
}
