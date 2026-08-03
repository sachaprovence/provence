import { describe, expect, it } from "vitest";
import { GET as plansRoute } from "@/app/api/plans/route";
import { PlanKey } from "@/generated/prisma/enums";

/**
 * Route publique `GET /api/plans` (v1.0, AR-0064) — sans authentification
 * (contrairement à `GET /api/settings/billing`), utilisée par la page
 * d'inscription pour permettre le choix d'un plan avant la création du
 * compte. Ne dépend pas de `next/headers`, donc testable directement.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("GET /api/plans", () => {
  it("liste les 3 plans de référence sans nécessiter de session", async () => {
    const response = await plansRoute();
    expect(response.status).toBe(200);
    const body = await response.json();
    const keys = body.plans.map((plan: { key: string }) => plan.key).sort();
    expect(keys).toEqual([PlanKey.ENTERPRISE, PlanKey.PRO, PlanKey.STARTER].sort());
  });
});
