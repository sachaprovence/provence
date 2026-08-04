import { describe, expect, it, vi } from "vitest";

const loggerError = vi.fn();
const captureExceptionBestEffort = vi.fn();

vi.mock("@/lib/logger", () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/observability/error-tracking", () => ({
  captureExceptionBestEffort,
}));

const { onRequestError } = await import("@/instrumentation");

/**
 * Filet de sécurité pour les erreurs hors `toApiErrorResponse` (v1.3,
 * AR-0173) : rendu de Server Component, Server Action, Proxy. Seul point
 * d'entrée officiel Next.js pour ce cas (voir `src/instrumentation.ts`).
 */
describe("onRequestError (AR-0173)", () => {
  it("journalise l'erreur avec le contexte de route/routeur et la capture pour Sentry", async () => {
    const error = new Error("erreur de rendu inattendue");
    await onRequestError(
      error,
      { path: "/leads/123", method: "GET", headers: { "x-request-id": "req-abc" } },
      { routerKind: "App Router", routePath: "/app/leads/[id]/page", routeType: "render", revalidateReason: undefined }
    );

    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: error,
        route: "/leads/123",
        method: "GET",
        routerKind: "App Router",
        routePath: "/app/leads/[id]/page",
        routeType: "render",
        requestId: "req-abc",
      }),
      expect.any(String)
    );
    expect(captureExceptionBestEffort).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ route: "/leads/123", requestId: "req-abc" })
    );
  });

  it("gère un en-tête x-request-id multi-valeurs (tableau) sans planter", async () => {
    const error = new Error("erreur action");
    await onRequestError(
      error,
      { path: "/api/leads", method: "POST", headers: { "x-request-id": ["req-1", "req-2"] } },
      { routerKind: "App Router", routePath: "/app/api/leads/route", routeType: "action", revalidateReason: undefined }
    );

    expect(loggerError).toHaveBeenCalledWith(expect.objectContaining({ requestId: "req-1" }), expect.any(String));
  });

  it("gère l'absence d'en-tête x-request-id (requestId undefined, jamais un plantage)", async () => {
    const error = new Error("erreur proxy");
    await onRequestError(
      error,
      { path: "/dashboard", method: "GET", headers: {} },
      { routerKind: "App Router", routePath: "/app/proxy", routeType: "proxy", revalidateReason: undefined }
    );

    expect(loggerError).toHaveBeenCalledWith(expect.objectContaining({ requestId: undefined }), expect.any(String));
  });
});
