import { afterAll, describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiMetrics } from "@/lib/observability/api-metrics";

/**
 * `withApiMetrics` (v0.9 bis, AR-0049) — enveloppe un Route Handler et
 * enregistre réellement une ligne `ApiRequestMetric`, sans jamais changer
 * la réponse retournée à l'appelant (même en cas d'exception).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("withApiMetrics", () => {
  const createdMetricIds: string[] = [];

  afterAll(async () => {
    await prisma.apiRequestMetric.deleteMany({ where: { id: { in: createdMetricIds } } });
  });

  it("enregistre une métrique réelle sans changer la réponse retournée", async () => {
    const handler = withApiMetrics("GET /api/test-route", async () => NextResponse.json({ ok: true }, { status: 200 }));
    const request = new Request("http://localhost/api/test-route", { method: "GET" });
    const response = await handler(request, undefined);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true });

    // Laisse le temps au enregistrement fire-and-forget (organisation non authentifiée ici) de s'exécuter.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const metric = await prisma.apiRequestMetric.findFirst({ where: { route: "GET /api/test-route" }, orderBy: { createdAt: "desc" } });
    expect(metric).not.toBeNull();
    if (metric) {
      createdMetricIds.push(metric.id);
      expect(metric.statusCode).toBe(200);
      expect(metric.method).toBe("GET");
      expect(metric.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("laisse remonter une exception du handler enveloppé (jamais avalée)", async () => {
    const handler = withApiMetrics("GET /api/test-route-error", async () => {
      throw new Error("erreur simulée dans le handler");
    });
    const request = new Request("http://localhost/api/test-route-error", { method: "GET" });
    await expect(handler(request, undefined)).rejects.toThrow("erreur simulée dans le handler");
  });
});
