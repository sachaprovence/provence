import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { realAppDbName, pgToolConnectionUrl } from "./temp-db-guardrails";

/**
 * Logique de sauvegarde PostgreSQL (v1.2, AR-0166) — extraite dans un
 * module SANS `main()` (contrairement à `scripts/backup-database.ts`, qui
 * l'appelle) pour être importée en sécurité par
 * `scripts/verify-database-backup.ts` — voir la mise en garde documentée
 * dans `temp-db-guardrails.ts` : un script d'orchestration avec un
 * `main()` exécuté au chargement ne doit jamais être importé directement.
 */

export interface BackupMetadata {
  createdAt: string;
  databaseName: string;
  format: "custom";
  sizeBytes: number;
  sha256: string;
  pgDumpVersion: string;
  /** `true` uniquement après une exécution réussie de `verify-database-backup.ts` sur CE fichier — jamais mis à `true` par `backupDatabase`. */
  restoreVerified: boolean;
  /** Renseigné par `verify-database-backup.ts` lors de la vérification — absent tant qu'aucune vérification n'a eu lieu. */
  restoreVerifiedAt?: string;
}

export function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function pgDumpVersion(): string {
  const result = spawnSync("pg_dump", ["--version"], { encoding: "utf-8" });
  return result.stdout?.trim() ?? "inconnue";
}

export function metadataPathFor(dumpPath: string): string {
  return `${dumpPath}.meta.json`;
}

export function readBackupMetadata(dumpPath: string): BackupMetadata {
  const metadataPath = metadataPathFor(dumpPath);
  if (!fs.existsSync(metadataPath)) {
    throw new Error(`Métadonnées de sauvegarde introuvables : ${metadataPath} (fichier généré par backup-database.ts, requis pour vérifier l'intégrité).`);
  }
  return JSON.parse(fs.readFileSync(metadataPath, "utf-8")) as BackupMetadata;
}

export function writeBackupMetadata(dumpPath: string, metadata: BackupMetadata): void {
  fs.writeFileSync(metadataPathFor(dumpPath), JSON.stringify(metadata, null, 2));
}

/**
 * `pg_dump --format=custom` — lecture seule sur la base source (jamais
 * destructif), compatible `pg_restore` (restauration sélective,
 * compression native). Refuse un fichier vide/absent plutôt que de
 * déclarer un succès sur la seule foi du code de sortie de `pg_dump`.
 */
export function backupDatabase(outputDir: string, databaseUrl: string): { dumpPath: string; metadata: BackupMetadata } {
  fs.mkdirSync(outputDir, { recursive: true });

  const databaseName = realAppDbName(databaseUrl);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dumpPath = path.join(outputDir, `${databaseName}_${timestamp}.dump`);

  const result = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--file=${dumpPath}`, pgToolConnectionUrl(databaseUrl)], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`pg_dump a échoué (code ${result.status}) — aucun fichier de sauvegarde fiable produit.`);
  }
  if (!fs.existsSync(dumpPath)) {
    throw new Error(`pg_dump a annoncé un succès mais le fichier attendu est absent : ${dumpPath}`);
  }

  const sizeBytes = fs.statSync(dumpPath).size;
  if (sizeBytes === 0) {
    throw new Error(`Le fichier de sauvegarde produit est vide (0 octet) : ${dumpPath} — refusé.`);
  }

  const metadata: BackupMetadata = {
    createdAt: new Date().toISOString(),
    databaseName,
    format: "custom",
    sizeBytes,
    sha256: sha256File(dumpPath),
    pgDumpVersion: pgDumpVersion(),
    restoreVerified: false,
  };
  writeBackupMetadata(dumpPath, metadata);

  return { dumpPath, metadata };
}

/** Lève si le fichier a été altéré/tronqué depuis sa création — une sauvegarde corrompue ne doit jamais être restaurée silencieusement. */
export function verifyBackupIntegrity(dumpPath: string, metadata: BackupMetadata): void {
  if (!fs.existsSync(dumpPath)) {
    throw new Error(`Fichier de sauvegarde introuvable : ${dumpPath}`);
  }
  const actualSha256 = sha256File(dumpPath);
  if (actualSha256 !== metadata.sha256) {
    throw new Error(
      `Intégrité rompue : l'empreinte SHA-256 du fichier (${actualSha256}) ne correspond plus à celle enregistrée à la création (${metadata.sha256}) — fichier altéré ou tronqué, restauration refusée.`
    );
  }
}
