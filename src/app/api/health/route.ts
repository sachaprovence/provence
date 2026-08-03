import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Point de contrôle santé pour les orchestrateurs (Docker `HEALTHCHECK`,
 * load balancer, supervision). Public par design (aucune donnée sensible),
 * exclu de l'authentification dans `src/proxy.ts`.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    logger.error({ err: error }, "Échec du contrôle de santé (base de données injoignable).");
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
