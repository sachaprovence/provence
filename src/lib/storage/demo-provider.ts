import "server-only";
import crypto from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { StorageProvider } from "./types";

/**
 * Stockage démo (v1.1, AR-0162) — écrit sur le système de fichiers local
 * du serveur, servi par `GET /api/storage/demo/[...path]` (authentifié,
 * vérifie que le fichier appartient à l'organisation de l'acteur).
 * Fonctionne sans configuration externe, même principe que les autres
 * fournisseurs démo du projet.
 */
const STORAGE_ROOT = path.join(process.cwd(), "storage-demo");

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
}

export class DemoStorageProvider implements StorageProvider {
  readonly name = "demo";

  async upload(params: { organizationId: string; fileName: string; mimeType: string; data: Buffer }): Promise<{ url: string }> {
    const safeName = `${crypto.randomUUID()}-${sanitizeFileName(params.fileName)}`;
    const orgDir = path.join(STORAGE_ROOT, params.organizationId);
    await mkdir(orgDir, { recursive: true });
    await writeFile(path.join(orgDir, safeName), params.data);
    return { url: `/api/storage/demo/${params.organizationId}/${safeName}` };
  }
}
