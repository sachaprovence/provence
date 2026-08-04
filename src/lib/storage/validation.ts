import "server-only";
import { ValidationError } from "@/lib/errors";

/**
 * Validation d'upload partagée par TOUS les fournisseurs de stockage
 * (v1.2, AR-0164) — centralisée ici plutôt que dupliquée par fournisseur ou
 * laissée à la seule discrétion de la route appelante, pour qu'un fichier
 * invalide soit rejeté de façon identique quel que soit le point d'entrée
 * (aujourd'hui `POST /api/attachments/upload`, demain un éventuel appel
 * direct depuis un agent IA ou une automatisation).
 */

export const DEFAULT_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

/** Types MIME autorisés par défaut — pièces jointes CRM (photos, plans, contrats, exports). */
export const DEFAULT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/** `STORAGE_MAX_FILE_SIZE_BYTES` — taille maximale configurable (octets). Retombe sur le défaut si absente/invalide. */
export function getMaxFileSizeBytes(): number {
  const raw = process.env.STORAGE_MAX_FILE_SIZE_BYTES;
  if (!raw) return DEFAULT_MAX_FILE_SIZE_BYTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_FILE_SIZE_BYTES;
  return parsed;
}

/** `STORAGE_ALLOWED_MIME_TYPES` — liste séparée par des virgules. Retombe sur le défaut si absente. */
export function getAllowedMimeTypes(): string[] {
  const raw = process.env.STORAGE_ALLOWED_MIME_TYPES;
  if (!raw) return DEFAULT_ALLOWED_MIME_TYPES;
  const parsed = raw
    .split(",")
    .map((type) => type.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_MIME_TYPES;
}

/**
 * Rejette un upload invalide AVANT tout appel réseau au fournisseur de
 * stockage (taille, type MIME, nom de fichier) — lève `ValidationError`
 * (déjà convertie en 400 par `toApiErrorResponse`, voir src/lib/errors.ts).
 */
export function validateUpload(params: { fileName: string; mimeType: string; sizeBytes: number }): void {
  if (!params.fileName || !params.fileName.trim()) {
    throw new ValidationError("Nom de fichier requis.");
  }

  const maxSize = getMaxFileSizeBytes();
  if (params.sizeBytes > maxSize) {
    throw new ValidationError(`Fichier trop volumineux (${Math.round(maxSize / (1024 * 1024))} Mo maximum).`);
  }
  if (params.sizeBytes <= 0) {
    throw new ValidationError("Fichier vide.");
  }

  const allowed = getAllowedMimeTypes();
  if (!allowed.includes(params.mimeType.toLowerCase())) {
    throw new ValidationError(`Type de fichier non autorisé : "${params.mimeType}".`);
  }
}
