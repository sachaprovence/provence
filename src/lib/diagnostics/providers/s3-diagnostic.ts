import "server-only";
import { S3StorageProvider } from "@/lib/storage/providers/s3";
import type { IntegrationConfigState, IntegrationDiagnosticProvider, IntegrationTestResult } from "../types";

/**
 * Diagnostic S3 (v1.2, AR-0165) — configuration de DÉPLOIEMENT
 * (`STORAGE_S3_*`), jamais par organisation (voir `src/lib/storage/
 * index.ts`) : identique quelle que soit l'organisation appelante. Le test
 * de connexion délègue à `S3StorageProvider.testConnection()`
 * (`src/lib/storage/providers/s3.ts`) plutôt que de dupliquer la logique de
 * signature SigV4 ici.
 */
export async function getS3ConfigState(): Promise<IntegrationConfigState> {
  const presentCount = [
    process.env.STORAGE_S3_BUCKET,
    process.env.STORAGE_S3_REGION,
    process.env.STORAGE_S3_ACCESS_KEY_ID,
    process.env.STORAGE_S3_SECRET_ACCESS_KEY,
  ].filter(Boolean).length;
  if (presentCount === 0) return "NOT_CONFIGURED";
  if (presentCount === 4) return "CONFIGURED";
  return "PARTIALLY_CONFIGURED";
}

export async function testS3Connection(): Promise<IntegrationTestResult> {
  return new S3StorageProvider().testConnection();
}

export const s3DiagnosticProvider: IntegrationDiagnosticProvider = {
  key: "S3_STORAGE",
  label: "Stockage S3",
  getConfigState: () => getS3ConfigState(),
  testConnection: () => testS3Connection(),
};
