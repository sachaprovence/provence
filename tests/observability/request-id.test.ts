import { describe, expect, it } from "vitest";
import { REQUEST_ID_HEADER, resolveRequestId, getRequestId } from "@/lib/observability/request-id";

/**
 * Identifiant de corrélation par requête (v1.2, AR-0168) — posé par
 * `src/proxy.ts` sur chaque requête (en-tête de requête ET de réponse),
 * lu par les gestionnaires de route via `getRequestId`.
 */
describe("resolveRequestId (AR-0168)", () => {
  it("génère un identifiant si aucun n'est fourni en amont", () => {
    const id = resolveRequestId(null);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("respecte un identifiant déjà posé par un proxy amont de confiance", () => {
    expect(resolveRequestId("upstream-trace-id-abc123")).toBe("upstream-trace-id-abc123");
  });

  it("génère un nouvel identifiant plutôt que d'accepter une valeur vide ou excessivement longue", () => {
    expect(resolveRequestId("")).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId("x".repeat(500))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("génère un identifiant différent à chaque appel sans valeur amont", () => {
    expect(resolveRequestId(null)).not.toBe(resolveRequestId(null));
  });
});

describe("getRequestId (AR-0168)", () => {
  it("lit l'en-tête posé par le proxy sur la requête reçue par le gestionnaire de route", () => {
    const request = new Request("http://localhost/api/test", { headers: { [REQUEST_ID_HEADER]: "req-abc123" } });
    expect(getRequestId(request)).toBe("req-abc123");
  });

  it("renvoie null si l'en-tête est absent (jamais une exception)", () => {
    const request = new Request("http://localhost/api/test");
    expect(getRequestId(request)).toBeNull();
  });
});
