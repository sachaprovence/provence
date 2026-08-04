import { describe, expect, it } from "vitest";
import { withTimeout, DiagnosticTimeoutError } from "@/lib/diagnostics/with-timeout";

describe("withTimeout (AR-0165)", () => {
  it("résout normalement si la promesse se résout avant le délai", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1000, "test")).resolves.toBe("ok");
  });

  it("rejette avec l'erreur d'origine si la promesse rejette avant le délai", async () => {
    await expect(withTimeout(Promise.reject(new Error("échec réel")), 1000, "test")).rejects.toThrow("échec réel");
  });

  it("rejette avec DiagnosticTimeoutError si la promesse ne se résout jamais avant le délai", async () => {
    const neverResolves = new Promise(() => {});
    await expect(withTimeout(neverResolves, 20, "Fournisseur X")).rejects.toBeInstanceOf(DiagnosticTimeoutError);
    await expect(withTimeout(neverResolves, 20, "Fournisseur X")).rejects.toThrow(/Fournisseur X/);
  });
});
