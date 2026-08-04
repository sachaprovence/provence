import { NextResponse } from "next/server";

/**
 * Liveness (v1.2, AR-0167) — prouve uniquement que le processus répond,
 * SANS vérifier aucune dépendance (base de données, migrations,
 * configuration). Distinct de `GET /api/health/ready` (readiness) : un
 * orchestrateur (Kubernetes, Docker Swarm...) redémarre le conteneur si la
 * liveness échoue, mais ne doit JAMAIS redémarrer un conteneur sain dont
 * seule une dépendance externe est temporairement indisponible — c'est
 * exactement le rôle de la readiness (retire le conteneur du load
 * balancer sans le redémarrer).
 */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
