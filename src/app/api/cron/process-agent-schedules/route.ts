import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { processDueAgentSchedules } from "@/lib/agents/scheduler";

/** Traitement planifié des planifications d'agent (ONE_OFF/RECURRING) — voir ADR 0008. */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const results = await processDueAgentSchedules();

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok),
  });
}
