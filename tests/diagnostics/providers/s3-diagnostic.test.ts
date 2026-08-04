import { afterEach, describe, expect, it } from "vitest";
import { getS3ConfigState } from "@/lib/diagnostics/providers/s3-diagnostic";

/**
 * Diagnostic S3 (v1.2, AR-0165) — configuration de déploiement (jamais par
 * organisation). Le test de connexion réel (`testS3Connection`) délègue à
 * `S3StorageProvider.testConnection()`, déjà couvert par
 * `tests/storage/s3-provider.test.ts` — pas dupliqué ici.
 */
const ORIGINAL_ENV = { ...process.env };

function restoreEnv(key: string, original: string | undefined) {
  if (original === undefined) delete process.env[key];
  else process.env[key] = original;
}

afterEach(() => {
  restoreEnv("STORAGE_S3_BUCKET", ORIGINAL_ENV.STORAGE_S3_BUCKET);
  restoreEnv("STORAGE_S3_REGION", ORIGINAL_ENV.STORAGE_S3_REGION);
  restoreEnv("STORAGE_S3_ACCESS_KEY_ID", ORIGINAL_ENV.STORAGE_S3_ACCESS_KEY_ID);
  restoreEnv("STORAGE_S3_SECRET_ACCESS_KEY", ORIGINAL_ENV.STORAGE_S3_SECRET_ACCESS_KEY);
});

describe("getS3ConfigState (AR-0165)", () => {
  it("NOT_CONFIGURED sans aucune variable", async () => {
    delete process.env.STORAGE_S3_BUCKET;
    delete process.env.STORAGE_S3_REGION;
    delete process.env.STORAGE_S3_ACCESS_KEY_ID;
    delete process.env.STORAGE_S3_SECRET_ACCESS_KEY;
    expect(await getS3ConfigState()).toBe("NOT_CONFIGURED");
  });

  it("PARTIALLY_CONFIGURED avec certaines variables seulement", async () => {
    process.env.STORAGE_S3_BUCKET = "b";
    process.env.STORAGE_S3_REGION = "eu-west-3";
    delete process.env.STORAGE_S3_ACCESS_KEY_ID;
    delete process.env.STORAGE_S3_SECRET_ACCESS_KEY;
    expect(await getS3ConfigState()).toBe("PARTIALLY_CONFIGURED");
  });

  it("CONFIGURED avec les 4 variables", async () => {
    process.env.STORAGE_S3_BUCKET = "b";
    process.env.STORAGE_S3_REGION = "eu-west-3";
    process.env.STORAGE_S3_ACCESS_KEY_ID = "AKIA";
    process.env.STORAGE_S3_SECRET_ACCESS_KEY = "secret";
    expect(await getS3ConfigState()).toBe("CONFIGURED");
  });
});
