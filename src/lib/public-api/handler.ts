import "server-only";
import { NextResponse } from "next/server";
import { toApiErrorResponse } from "@/lib/errors";
import { resolvePublicApiActor, type PublicApiActor } from "./auth";
import { assertPublicApiRateLimitAvailable } from "@/lib/rate-limit";

/**
 * Point d'entrée commun de toutes les routes `api/public/v1/**` (v1.0,
 * AR-0059/AR-0060) — authentification par clé API, limitation de débit, et
 * conversion d'erreur centralisées en un seul endroit, plutôt que
 * dupliquées dans chaque route (même principe que `withApiMetrics`,
 * v0.9 bis).
 */
async function authenticateAndRateLimit(request: Request): Promise<PublicApiActor> {
  const actor = await resolvePublicApiActor(request);
  assertPublicApiRateLimitAvailable(actor.apiKeyId);
  return actor;
}

export function withPublicApiHandler(handler: (request: Request, actor: PublicApiActor) => Promise<NextResponse>) {
  return async (request: Request): Promise<NextResponse> => {
    try {
      const actor = await authenticateAndRateLimit(request);
      return await handler(request, actor);
    } catch (error) {
      return toApiErrorResponse(error, request, { route: "public-api" });
    }
  };
}

export function withPublicApiHandlerParams<TParams extends Record<string, string>>(
  handler: (request: Request, actor: PublicApiActor, params: TParams) => Promise<NextResponse>
) {
  return async (request: Request, context: { params: Promise<TParams> }): Promise<NextResponse> => {
    try {
      const actor = await authenticateAndRateLimit(request);
      const params = await context.params;
      return await handler(request, actor, params);
    } catch (error) {
      return toApiErrorResponse(error, request, { route: "public-api" });
    }
  };
}
