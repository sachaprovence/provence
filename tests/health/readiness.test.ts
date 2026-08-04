import { describe, expect, it } from "vitest";
import { evaluateReadiness } from "@/lib/health/readiness";
import { GET as healthRoute } from "@/app/api/health/route";
import { GET as liveRoute } from "@/app/api/health/live/route";
import { GET as readyRoute } from "@/app/api/health/ready/route";

/**
 * Liveness/readiness (v1.2, AR-0167) — routes sans dépendance à
 * `next/headers` (aucune session requise), donc testables directement
 * (même raisonnement que `tests/billing/plans-route.test.ts`).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describe("GET /api/health/live — liveness pure, aucune dépendance", () => {
  it("renvoie toujours 200 sans jamais accéder à la base de données", async () => {
    const response = await liveRoute();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok" });
  });
});

runIfDatabase("evaluateReadiness (AR-0167)", () => {
  it("renvoie ready: true avec les 3 vérifications à 'ok' sur un environnement de développement sain", async () => {
    const result = await evaluateReadiness();
    expect(result.ready).toBe(true);
    expect(result.checks).toEqual({ database: "ok", migrations: "ok", configuration: "ok" });
  });

  it("ne renvoie jamais de détail exploitable (message d'erreur brut, nom de table, pile d'appel)", async () => {
    const result = await evaluateReadiness();
    const serialized = JSON.stringify(result);
    // Le résultat structuré ne doit contenir QUE des états ("ok"/"error"), jamais
    // de texte libre pouvant véhiculer un détail interne.
    expect(serialized).not.toMatch(/Error|error:|_prisma_migrations|SELECT|stack/i);
  });
});

runIfDatabase("GET /api/health/ready", () => {
  it("renvoie 200 et le détail structuré des vérifications quand tout est prêt", async () => {
    const response = await readyRoute();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.checks).toEqual({ database: "ok", migrations: "ok", configuration: "ok" });
  });
});

runIfDatabase("GET /api/health (legacy, conservé pour compatibilité)", () => {
  it("renvoie la forme de réponse historique {status} inchangée", async () => {
    const response = await healthRoute();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok" });
  });
});
