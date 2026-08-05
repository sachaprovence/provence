import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { isValidCronRequest } from "@/lib/security/webhook-secret";
import { processDueSequences } from "@/lib/sequence-engine";
import { checkStaleQuotes } from "@/lib/automation-engine";
import { prisma } from "@/lib/prisma";

/**
 * Traitement planifié des séquences. Peut être déclenché :
 * - manuellement depuis l'UI (bouton "Traiter les relances maintenant" en mode démo) ;
 * - par un vrai cron système / Vercel Cron en pointant sur cette route avec l'en-tête
 *   `Authorization: Bearer <CRON_SECRET>` (variable d'environnement à définir).
 */
export async function POST(request: Request) {
  const isCron = isValidCronRequest(request);

  if (!isCron) {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const results = await processDueSequences();

  const organizations = await prisma.organization.findMany({ select: { id: true } });
  let staleQuoteTasks = 0;
  for (const org of organizations) {
    staleQuoteTasks += await checkStaleQuotes(org.id);
  }

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok),
    staleQuoteTasksCreated: staleQuoteTasks,
  });
}
