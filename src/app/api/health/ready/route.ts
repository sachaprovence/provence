import { NextResponse } from "next/server";
import { evaluateReadiness } from "@/lib/health/readiness";

/**
 * Readiness (v1.2, AR-0167) — vérifie les composants vraiment
 * indispensables (base de données, migrations appliquées, configuration
 * minimale), distinct de `GET /api/health/live` (liveness, aucune
 * vérification de dépendance). Ne renvoie jamais de détail exploitable
 * (nom de table, message d'erreur brut, pile d'appel) — voir
 * `src/lib/health/readiness.ts`.
 */
export async function GET() {
  const result = await evaluateReadiness();
  return NextResponse.json({ status: result.ready ? "ok" : "error", checks: result.checks }, { status: result.ready ? 200 : 503 });
}
