import "server-only";
import type { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentActor } from "@/lib/auth";
import { logger } from "@/lib/logger";

/**
 * Latence API (brief v0.9 bis, AR-0049) — `ApiRequestMetric` (nouveau,
 * seule mesure qui n'existait pas déjà sous une autre forme). Appliquée de
 * façon INCRÉMENTALE à quelques routes représentatives via
 * `withApiMetrics`, jamais un middleware global sur toutes les routes —
 * risque de régression disproportionné par rapport à la valeur pour cette
 * phase (voir ADR dédiée v0.9 bis). Étendre la couverture = envelopper une
 * route de plus, sans changement d'architecture.
 */
export async function recordApiMetric(params: {
  organizationId?: string | null;
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
}): Promise<void> {
  try {
    await prisma.apiRequestMetric.create({
      data: {
        organizationId: params.organizationId ?? undefined,
        route: params.route,
        method: params.method,
        statusCode: params.statusCode,
        durationMs: params.durationMs,
      },
    });
  } catch (error) {
    // Jamais bloquant : un échec d'enregistrement de métrique ne doit jamais faire échouer la requête réelle.
    logger.warn({ err: error }, "Échec de l'enregistrement d'une métrique API (ignoré).");
  }
}

type RouteHandler<Req extends Request, C> = (request: Req, context: C) => Promise<NextResponse>;

/** Enveloppe un Route Handler pour mesurer sa latence réelle, sans jamais changer son comportement. */
export function withApiMetrics<Req extends Request = Request, C = unknown>(
  route: string,
  handler: RouteHandler<Req, C>
): RouteHandler<Req, C> {
  return async (request, context) => {
    const start = Date.now();
    let statusCode = 500;
    try {
      const response = await handler(request, context);
      statusCode = response.status;
      return response;
    } finally {
      const durationMs = Date.now() - start;
      const actor = await getCurrentActor().catch(() => null);
      void recordApiMetric({ organizationId: actor?.organization.id, route, method: request.method, statusCode, durationMs });
    }
  };
}
