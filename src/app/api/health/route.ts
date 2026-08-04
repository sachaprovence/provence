import { NextResponse } from "next/server";
import { evaluateReadiness } from "@/lib/health/readiness";

/**
 * Point de contrôle santé historique (Docker `HEALTHCHECK`,
 * `docker-compose.yml`, `scripts/test-migrations-fresh-db.ts`) — conservé
 * pour compatibilité, forme de réponse inchangée (`{status}`). Délègue
 * désormais à la même évaluation de readiness que `GET /api/health/ready`
 * (v1.2, AR-0167 — base de données, migrations, configuration), plutôt
 * qu'au seul `SELECT 1` d'origine : un signal plus complet sans rien
 * casser côté appelants existants. Public par design (aucune donnée
 * sensible), exclu de l'authentification dans `src/proxy.ts`.
 */
export async function GET() {
  const result = await evaluateReadiness();
  return NextResponse.json({ status: result.ready ? "ok" : "error" }, { status: result.ready ? 200 : 503 });
}
