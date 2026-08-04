import { NextResponse } from "next/server";
import { listPlans } from "@/lib/billing/plan-service";

/**
 * Liste publique des plans d'abonnement (v1.0, AR-0064) — sans
 * authentification, utilisée par la page d'inscription pour permettre le
 * choix d'un plan AVANT la création du compte. Ne jamais appeler
 * `requireActor()`/`requireActorApi()` ici (voir DEVELOPMENT_GUIDE.md
 * §0 undecies) : contrairement à `GET /api/settings/billing`, cette route
 * doit rester accessible sans session.
 */
export async function GET() {
  const plans = await listPlans();
  return NextResponse.json({ plans });
}
