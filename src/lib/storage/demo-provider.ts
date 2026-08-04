import "server-only";
import crypto from "node:crypto";
import path from "node:path";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import type { StorageProvider } from "./types";
import { assertKeyBelongsToOrganization } from "./key-guard";
import { validateUpload } from "./validation";

/**
 * Stockage démo (v1.1, AR-0162 ; téléchargement/suppression réels v1.2,
 * AR-0164) — écrit sur le système de fichiers local du serveur, servi par
 * `GET /api/storage/demo/[...path]` (authentifié, vérifie que le fichier
 * appartient à l'organisation de l'acteur). Fonctionne sans configuration
 * externe, même principe que les autres fournisseurs démo du projet.
 */
const STORAGE_ROOT = path.join(process.cwd(), "storage-demo");

const EXTENSION_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
}

export class DemoStorageProvider implements StorageProvider {
  readonly name = "demo";

  async upload(params: { organizationId: string; fileName: string; mimeType: string; data: Buffer }): Promise<{ url: string; key: string }> {
    validateUpload({ fileName: params.fileName, mimeType: params.mimeType, sizeBytes: params.data.byteLength });

    const safeName = `${crypto.randomUUID()}-${sanitizeFileName(params.fileName)}`;
    const key = `${params.organizationId}/${safeName}`;
    const orgDir = path.join(STORAGE_ROOT, params.organizationId);
    await mkdir(orgDir, { recursive: true });
    await writeFile(path.join(orgDir, safeName), params.data);
    return { url: `/api/storage/demo/${key}`, key };
  }

  async download(params: { organizationId: string; key: string }): Promise<{ data: Buffer; mimeType: string }> {
    assertKeyBelongsToOrganization(params.key, params.organizationId);
    const filePath = path.join(STORAGE_ROOT, params.key);
    const data = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    return { data, mimeType: EXTENSION_MIME_TYPES[extension] || "application/octet-stream" };
  }

  async delete(params: { organizationId: string; key: string }): Promise<void> {
    assertKeyBelongsToOrganization(params.key, params.organizationId);
    const filePath = path.join(STORAGE_ROOT, params.key);
    await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
