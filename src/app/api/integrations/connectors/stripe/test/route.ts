import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { testStripe } from "@/lib/integrations/connectors-service";

/** Stripe est une configuration de déploiement (variable d'environnement) — ce test réutilise le diagnostic v1.2 existant, jamais un "connect" par organisation. */
export async function POST(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");
    const result = await testStripe();
    return NextResponse.json(result);
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/integrations/connectors/stripe/test" });
  }
}
