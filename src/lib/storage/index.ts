import "server-only";
import { DemoStorageProvider } from "./demo-provider";
import { S3StorageProvider } from "./providers/s3";
import type { StorageProvider } from "./types";

/** Sélection du fournisseur de stockage — même convention que AI_PROVIDER/EMAIL_PROVIDER/BILLING_PROVIDER (v1.1, AR-0162). */
export function getStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER || "demo";
  switch (provider) {
    case "s3":
      return new S3StorageProvider();
    case "demo":
    default:
      return new DemoStorageProvider();
  }
}
