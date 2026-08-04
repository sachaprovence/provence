import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { requireS3BackupConfig, listAllObjects, getObject, sha256HexOf } from "./lib/s3-backup-client";
import { recordBackupRun } from "@/lib/observability/backup-metrics";

/**
 * Sauvegarde des objets S3 (v1.2, AR-0166) — télécharge une copie de TOUS
 * les objets du bucket configuré (`STORAGE_S3_*`) vers le système de
 * fichiers local, avec un manifeste (clé, empreinte SHA-256, taille,
 * type MIME) permettant de vérifier l'intégrité de chaque objet
 * individuellement (voir `scripts/verify-s3-backup.ts`).
 *
 * Usage : `npx tsx scripts/backup-s3-objects.ts [répertoire de sortie]`
 * (défaut : `./backups/s3`, ou `BACKUP_S3_DIR`).
 *
 * Lecture seule sur le bucket source (`GET`/`ListObjectsV2` uniquement) —
 * jamais d'écriture ni de suppression.
 */
export interface S3BackupManifestEntry {
  key: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
}

export interface S3BackupManifest {
  createdAt: string;
  bucket: string;
  region: string;
  objectCount: number;
  totalSizeBytes: number;
  objects: S3BackupManifestEntry[];
  /** `true` uniquement après une exécution réussie de `verify-s3-backup.ts` — jamais mis à `true` par ce script. */
  restoreVerified: boolean;
  restoreVerifiedAt?: string;
}

async function main() {
  const startedAt = new Date();
  try {
    await runBackup(startedAt);
  } catch (err) {
    await recordBackupRun({
      kind: "S3_BACKUP",
      success: false,
      startedAt,
      finishedAt: new Date(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function runBackup(startedAt: Date): Promise<void> {
  const outputDir = process.argv[2] || process.env.BACKUP_S3_DIR || "./backups/s3";
  const config = requireS3BackupConfig();

  console.log(`→ Listage des objets du bucket "${config.bucket}"...`);
  const objects = await listAllObjects(config);
  console.log(`  ${objects.length} objet(s) trouvé(s).`);

  if (objects.length === 0) {
    console.log("\n⚠️  Aucun objet à sauvegarder — bucket vide ou stockage démo actif (rien à faire côté S3).");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotDir = path.join(outputDir, timestamp);
  const objectsDir = path.join(snapshotDir, "objects");
  fs.mkdirSync(objectsDir, { recursive: true });

  const manifestEntries: S3BackupManifestEntry[] = [];
  let totalSizeBytes = 0;

  for (const [index, object] of objects.entries()) {
    process.stdout.write(`\r  téléchargement ${index + 1}/${objects.length} : ${object.key}`.padEnd(100));
    const { data, contentType } = await getObject(config, object.key);
    const destPath = path.join(objectsDir, object.key);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, data);

    const sha256 = sha256HexOf(data);
    manifestEntries.push({ key: object.key, sha256, sizeBytes: data.byteLength, contentType });
    totalSizeBytes += data.byteLength;
  }
  if (objects.length > 0) process.stdout.write("\n");

  const manifest: S3BackupManifest = {
    createdAt: new Date().toISOString(),
    bucket: config.bucket,
    region: config.region,
    objectCount: manifestEntries.length,
    totalSizeBytes,
    objects: manifestEntries,
    restoreVerified: false,
  };
  const manifestPath = path.join(snapshotDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\n✅ Sauvegarde S3 créée : ${snapshotDir} (${manifestEntries.length} objets, ${(totalSizeBytes / 1024 / 1024).toFixed(2)} Mo)`);
  console.log(`   Manifeste : ${manifestPath}`);
  console.log(
    `\n⚠️  Cette sauvegarde n'est PAS encore déclarée valide. Exécutez :\n   npx tsx scripts/verify-s3-backup.ts "${manifestPath}"\n   pour la confirmer par un aller-retour réel écriture/lecture sur le bucket.`
  );
  await recordBackupRun({ kind: "S3_BACKUP", success: true, startedAt, finishedAt: new Date(), sizeBytes: totalSizeBytes });
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
