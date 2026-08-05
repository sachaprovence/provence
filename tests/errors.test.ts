import { describe, expect, it, vi } from "vitest";
import { REQUEST_ID_HEADER } from "@/lib/observability/request-id";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { AppError, ValidationError, ForbiddenError, NotFoundError, toApiErrorResponse } =
  await import("@/lib/errors");
const { logger } = await import("@/lib/logger");

function fakeRequest(requestId?: string): Request {
  const headers = new Headers();
  if (requestId) headers.set(REQUEST_ID_HEADER, requestId);
  return new Request("http://localhost/api/test", { headers });
}

describe("toApiErrorResponse", () => {
  it("renvoie le message et le code d'une AppError exposée", async () => {
    const res = toApiErrorResponse(new ValidationError("Email invalide.", { field: "email" }), fakeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Email invalide.");
    expect(body.details).toEqual({ field: "email" });
  });

  it("respecte le statusCode d'une ForbiddenError et d'une NotFoundError", async () => {
    expect(toApiErrorResponse(new ForbiddenError(), fakeRequest()).status).toBe(403);
    expect(toApiErrorResponse(new NotFoundError(), fakeRequest()).status).toBe(404);
  });

  it("masque le message d'une AppError non exposée", async () => {
    const res = toApiErrorResponse(new AppError("détail interne", { statusCode: 500, expose: false }), fakeRequest());
    const body = await res.json();
    expect(body.error).not.toContain("détail interne");
  });

  it("masque le message d'une erreur inattendue et fournit un identifiant d'incident", async () => {
    const res = toApiErrorResponse(new Error("détail interne sensible"), fakeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain("détail interne sensible");
    expect(body.incidentId).toMatch(/^[0-9a-f-]{36}$/);
  });

  describe("requestId (v1.3, AR-0173)", () => {
    it("dérive requestId de l'en-tête X-Request-Id de la requête et le journalise", () => {
      toApiErrorResponse(new NotFoundError(), fakeRequest("req-abc-123"), { route: "GET /api/test" });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: "req-abc-123", route: "GET /api/test" }),
        expect.any(String)
      );
    });

    it("renvoie null (jamais undefined implicite) si la requête n'a jamais transité par le proxy (X-Request-Id absent)", () => {
      // En production, `src/proxy.ts` pose TOUJOURS l'en-tête (génère un UUID si absent) avant
      // que la requête n'atteigne un gestionnaire de route — `null` ici documente ce cas limite
      // (bypass du proxy, ex. appel direct en test) plutôt que de fabriquer un identifiant ici.
      toApiErrorResponse(new Error("erreur inattendue"), fakeRequest());
      const [context] = vi.mocked(logger.error).mock.calls.at(-1)!;
      expect((context as { requestId?: string | null }).requestId).toBeNull();
    });

    it("le contexte explicite passé par l'appelant ne peut jamais écraser requestId", () => {
      toApiErrorResponse(new NotFoundError(), fakeRequest("req-real"), { requestId: "spoofed", route: "GET /api/test" });
      const [context] = vi.mocked(logger.warn).mock.calls.at(-1)!;
      expect((context as { requestId?: string }).requestId).toBe("req-real");
    });
  });
});
