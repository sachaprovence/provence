import "dotenv/config";
import fs from "node:fs";
import crypto from "node:crypto";
import { requireS3BackupConfig, putObjectAtKey, getObject, deleteObjectAtKey, sha256HexOf } from "./lib/s3-backup-client";
import type { S3BackupManifest } from "./backup-s3-objects";
import { recordBackupRun } from "@/lib/observability/backup-metrics";

/**
 * Vérification de sauvegarde S3 par aller-retour RÉEL écriture/lecture
 * (v1.2, AR-0166) — même exigence que pour PostgreSQL
 * (`verify-database-backup.ts`) : une sauvegarde ne doit jamais être
 * déclarée valide sans preuve réelle de restaurabilité.
 *
 * Ne touche JAMAIS les objets réels d'une organisation : chaque objet
 * sauvegardé est réécrit sous une clé RÉSERVÉE
 * (`__provence_backup_verify__/<horodatage>/<clé d'origine>`) sur le MÊME
 * bucket, relu, comparé par empreinte SHA-256 à la copie locale de la
 * sauvegarde, puis supprimé (nettoyage systématique, y compris en cas
 * d'échec — bloc `finally`). Une restauration réelle "en place" (écrasant
 * les clés d'origine) est une opération distincte, délibérément non
 * automatisée ici — voir docs/operations/BACKUP_RESTORE.md.
 *
 * Usage : `npx tsx scripts/verify-s3-backup.ts <manifest.json>`
 */
function fail(message: string): never {
  throw new Error(message);
}

const VERIFY_PREFIX_ROOT = "__provence_backup_verify__";

async function main() {
  const startedAt = new Date();
  const manifestPath = process.argv[2];
  if (!manifestPath) fail("Usage : npx tsx scripts/verify-s3-backup.ts <manifest.json>");
  if (!fs.existsSync(manifestPath)) fail(`Manifeste introuvable : ${manifestPath}`);

  try {
    await verifyManifest(manifestPath, startedAt);
  } catch (err) {
    await recordBackupRun({
      kind: "S3_RESTORE_VERIFY",
      success: false,
      startedAt,
      finishedAt: new Date(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function verifyManifest(manifestPath: string, startedAt: Date): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as S3BackupManifest;
  const objectsDir = manifestPath.replace(/manifest\.json$/, "objects");
  const config = requireS3BackupConfig();

  const verifyPrefix = `${VERIFY_PREFIX_ROOT}/${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const uploadedVerifyKeys: string[] = [];

  console.log(`→ Vérification de la sauvegarde S3 "${manifestPath}" (${manifest.objectCount} objet(s))...`);
  console.log(`  Préfixe de vérification réservé (jamais un objet réel) : ${verifyPrefix}/`);

  try {
    // Sonde systématique, même sans objet réel à vérifier : prouve que les
    // identifiants et le bucket permettent réellement écriture + lecture +
    // suppression — une sauvegarde à 0 objet ne doit pas être confondue
    // avec "les identifiants ne fonctionnent pas".
    const pingKey = `${verifyPrefix}/__ping__`;
    const pingData = Buffer.from(`vérification AR-0166 ${new Date().toISOString()}`);
    await putObjectAtKey(config, pingKey, pingData, "text/plain");
    uploadedVerifyKeys.push(pingKey);
    const pingRoundTrip = await getObject(config, pingKey);
    if (sha256HexOf(pingRoundTrip.data) !== sha256HexOf(pingData)) {
      fail("La sonde de connectivité S3 a échoué : le contenu relu ne correspond pas au contenu écrit.");
    }
    console.log("  ✅ sonde de connectivité (écriture/lecture réelles) réussie.");

    let verifiedCount = 0;
    for (const [index, entry] of manifest.objects.entries()) {
      process.stdout.write(`\r  vérification ${index + 1}/${manifest.objects.length} : ${entry.key}`.padEnd(100));

      const localPath = `${objectsDir}/${entry.key}`;
      if (!fs.existsSync(localPath)) fail(`Copie locale absente pour "${entry.key}" (${localPath}) — sauvegarde incomplète.`);
      const localData = fs.readFileSync(localPath);
      const localSha256 = sha256HexOf(localData);
      if (localSha256 !== entry.sha256) {
        fail(`Copie locale de "${entry.key}" altérée depuis la sauvegarde (empreinte SHA-256 différente) — refusé.`);
      }

      const verifyKey = `${verifyPrefix}/${entry.key}`;
      await putObjectAtKey(config, verifyKey, localData, entry.contentType);
      uploadedVerifyKeys.push(verifyKey);
      const roundTrip = await getObject(config, verifyKey);
      const roundTripSha256 = sha256HexOf(roundTrip.data);
      if (roundTripSha256 !== entry.sha256) {
        fail(`Objet "${entry.key}" : l'aller-retour S3 a renvoyé un contenu différent (empreinte ${roundTripSha256} ≠ ${entry.sha256} attendue).`);
      }
      verifiedCount += 1;
    }
    if (manifest.objects.length > 0) process.stdout.write("\n");

    console.log(`\n✅ ${verifiedCount}/${manifest.objects.length} objet(s) vérifié(s) par aller-retour réel — sauvegarde déclarée valide.`);
    const updated: S3BackupManifest = { ...manifest, restoreVerified: true, restoreVerifiedAt: new Date().toISOString() };
    fs.writeFileSync(manifestPath, JSON.stringify(updated, null, 2));
    console.log(`   Manifeste mis à jour : ${manifestPath}`);
    await recordBackupRun({ kind: "S3_RESTORE_VERIFY", success: true, startedAt, finishedAt: new Date(), sizeBytes: manifest.totalSizeBytes });
  } finally {
    if (uploadedVerifyKeys.length > 0) {
      console.log(`\n→ nettoyage des ${uploadedVerifyKeys.length} copie(s) de vérification...`);
      for (const key of uploadedVerifyKeys) {
        await deleteObjectAtKey(config, key).catch((err) => {
          console.error(`  ⚠️  échec de la suppression de la copie de vérification "${key}" : ${err instanceof Error ? err.message : err}`);
        });
      }
      console.log("  ✅ copies de vérification supprimées.");
    }
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
