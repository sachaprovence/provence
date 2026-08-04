import { afterEach, describe, expect, it } from "vitest";
import {
  validateUpload,
  getMaxFileSizeBytes,
  getAllowedMimeTypes,
  DEFAULT_MAX_FILE_SIZE_BYTES,
  DEFAULT_ALLOWED_MIME_TYPES,
} from "@/lib/storage/validation";
import { ValidationError } from "@/lib/errors";

const ORIGINAL_ENV = { ...process.env };

/**
 * `process.env.KEY = undefined` NE supprime PAS la variable : Node
 * convertit toute valeur assignée en chaîne, donc cela affecterait
 * littéralement la chaîne `"undefined"` (bug réel rencontré pendant le
 * développement de ce test — une variable jamais définie dans l'environnement
 * réel redevenait, après un premier test qui la positionnait, la chaîne
 * `"undefined"` au lieu de disparaître, polluant tous les tests suivants).
 */
function restoreEnv(key: string, original: string | undefined) {
  if (original === undefined) delete process.env[key];
  else process.env[key] = original;
}

afterEach(() => {
  restoreEnv("STORAGE_MAX_FILE_SIZE_BYTES", ORIGINAL_ENV.STORAGE_MAX_FILE_SIZE_BYTES);
  restoreEnv("STORAGE_ALLOWED_MIME_TYPES", ORIGINAL_ENV.STORAGE_ALLOWED_MIME_TYPES);
});

describe("getMaxFileSizeBytes (AR-0164)", () => {
  it("renvoie le défaut si la variable d'environnement est absente", () => {
    delete process.env.STORAGE_MAX_FILE_SIZE_BYTES;
    expect(getMaxFileSizeBytes()).toBe(DEFAULT_MAX_FILE_SIZE_BYTES);
  });

  it("respecte une valeur configurée valide", () => {
    process.env.STORAGE_MAX_FILE_SIZE_BYTES = "1048576";
    expect(getMaxFileSizeBytes()).toBe(1048576);
  });

  it("retombe sur le défaut si la valeur configurée est invalide (non numérique, négative, nulle)", () => {
    process.env.STORAGE_MAX_FILE_SIZE_BYTES = "pas-un-nombre";
    expect(getMaxFileSizeBytes()).toBe(DEFAULT_MAX_FILE_SIZE_BYTES);
    process.env.STORAGE_MAX_FILE_SIZE_BYTES = "-5";
    expect(getMaxFileSizeBytes()).toBe(DEFAULT_MAX_FILE_SIZE_BYTES);
    process.env.STORAGE_MAX_FILE_SIZE_BYTES = "0";
    expect(getMaxFileSizeBytes()).toBe(DEFAULT_MAX_FILE_SIZE_BYTES);
  });
});

describe("getAllowedMimeTypes (AR-0164)", () => {
  it("renvoie la liste par défaut si la variable d'environnement est absente", () => {
    delete process.env.STORAGE_ALLOWED_MIME_TYPES;
    expect(getAllowedMimeTypes()).toEqual(DEFAULT_ALLOWED_MIME_TYPES);
  });

  it("respecte une liste configurée, découpée et normalisée en minuscules", () => {
    process.env.STORAGE_ALLOWED_MIME_TYPES = "image/JPEG, application/PDF ,text/plain";
    expect(getAllowedMimeTypes()).toEqual(["image/jpeg", "application/pdf", "text/plain"]);
  });
});

describe("validateUpload (AR-0164)", () => {
  it("accepte un fichier de taille et type valides", () => {
    expect(() => validateUpload({ fileName: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 1024 })).not.toThrow();
  });

  it("rejette un nom de fichier vide", () => {
    expect(() => validateUpload({ fileName: "", mimeType: "image/jpeg", sizeBytes: 1024 })).toThrow(ValidationError);
    expect(() => validateUpload({ fileName: "   ", mimeType: "image/jpeg", sizeBytes: 1024 })).toThrow(ValidationError);
  });

  it("rejette un fichier vide (0 octet)", () => {
    expect(() => validateUpload({ fileName: "vide.txt", mimeType: "text/plain", sizeBytes: 0 })).toThrow(ValidationError);
  });

  it("rejette un fichier dépassant la taille maximale par défaut", () => {
    expect(() =>
      validateUpload({ fileName: "gros.pdf", mimeType: "application/pdf", sizeBytes: 21 * 1024 * 1024 })
    ).toThrow(ValidationError);
  });

  it("rejette un fichier dépassant une taille maximale configurée", () => {
    process.env.STORAGE_MAX_FILE_SIZE_BYTES = "1000";
    expect(() => validateUpload({ fileName: "moyen.pdf", mimeType: "application/pdf", sizeBytes: 1001 })).toThrow(ValidationError);
    expect(() => validateUpload({ fileName: "moyen.pdf", mimeType: "application/pdf", sizeBytes: 1000 })).not.toThrow();
  });

  it("rejette un type MIME hors de la liste autorisée par défaut", () => {
    expect(() =>
      validateUpload({ fileName: "script.exe", mimeType: "application/x-msdownload", sizeBytes: 100 })
    ).toThrow(ValidationError);
  });

  it("respecte une liste de types MIME configurée, plus restrictive que le défaut", () => {
    process.env.STORAGE_ALLOWED_MIME_TYPES = "application/pdf";
    expect(() => validateUpload({ fileName: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 100 })).toThrow(ValidationError);
    expect(() => validateUpload({ fileName: "doc.pdf", mimeType: "application/pdf", sizeBytes: 100 })).not.toThrow();
  });
});
