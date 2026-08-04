import { afterEach, describe, expect, it } from "vitest";
import { assertDiagnosticTestRateLimitAvailable } from "@/lib/diagnostics/rate-limit";
import { clearRateLimitBuckets } from "@/lib/security/rate-limiter";
import { TooManyRequestsError } from "@/lib/errors";

describe("assertDiagnosticTestRateLimitAvailable (AR-0165)", () => {
  afterEach(() => clearRateLimitBuckets());

  it("autorise les 5 premiers tests sur une fenêtre", () => {
    for (let i = 0; i < 5; i += 1) {
      expect(() => assertDiagnosticTestRateLimitAvailable("org-rate-limit", "STRIPE")).not.toThrow();
    }
  });

  it("refuse le 6e test avec TooManyRequestsError", () => {
    for (let i = 0; i < 5; i += 1) assertDiagnosticTestRateLimitAvailable("org-rate-limit-2", "STRIPE");
    expect(() => assertDiagnosticTestRateLimitAvailable("org-rate-limit-2", "STRIPE")).toThrow(TooManyRequestsError);
  });

  it("isole le débit par organisation ET par intégration (une clé bloquée n'affecte pas les autres)", () => {
    for (let i = 0; i < 5; i += 1) assertDiagnosticTestRateLimitAvailable("org-rate-limit-3", "STRIPE");
    expect(() => assertDiagnosticTestRateLimitAvailable("org-rate-limit-3", "STRIPE")).toThrow(TooManyRequestsError);
    expect(() => assertDiagnosticTestRateLimitAvailable("org-rate-limit-3", "TWILIO")).not.toThrow();
    expect(() => assertDiagnosticTestRateLimitAvailable("org-rate-limit-4", "STRIPE")).not.toThrow();
  });
});
