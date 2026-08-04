import { describe, expect, it } from "vitest";
import { isProductionWithDemoStorage } from "@/lib/storage/production-guard";

describe("isProductionWithDemoStorage (AR-0164)", () => {
  it("signale le risque en production avec le stockage démo", () => {
    expect(isProductionWithDemoStorage("production", "demo")).toBe(true);
  });

  it("signale le risque en production si STORAGE_PROVIDER n'est ni s3 ni démo (valeur inconnue = démo par défaut)", () => {
    expect(isProductionWithDemoStorage("production", "inconnu")).toBe(true);
  });

  it("ne signale rien en production avec le stockage S3", () => {
    expect(isProductionWithDemoStorage("production", "s3")).toBe(false);
  });

  it("ne signale rien hors production, même avec le stockage démo", () => {
    expect(isProductionWithDemoStorage("development", "demo")).toBe(false);
    expect(isProductionWithDemoStorage("test", "demo")).toBe(false);
  });
});
