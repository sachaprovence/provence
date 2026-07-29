import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { AppError, ValidationError, ForbiddenError, NotFoundError, toApiErrorResponse } =
  await import("@/lib/errors");

describe("toApiErrorResponse", () => {
  it("renvoie le message et le code d'une AppError exposée", async () => {
    const res = toApiErrorResponse(new ValidationError("Email invalide.", { field: "email" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Email invalide.");
    expect(body.details).toEqual({ field: "email" });
  });

  it("respecte le statusCode d'une ForbiddenError et d'une NotFoundError", async () => {
    expect(toApiErrorResponse(new ForbiddenError()).status).toBe(403);
    expect(toApiErrorResponse(new NotFoundError()).status).toBe(404);
  });

  it("masque le message d'une AppError non exposée", async () => {
    const res = toApiErrorResponse(new AppError("détail interne", { statusCode: 500, expose: false }));
    const body = await res.json();
    expect(body.error).not.toContain("détail interne");
  });

  it("masque le message d'une erreur inattendue et fournit un identifiant d'incident", async () => {
    const res = toApiErrorResponse(new Error("détail interne sensible"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain("détail interne sensible");
    expect(body.incidentId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
