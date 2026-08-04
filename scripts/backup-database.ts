import "dotenv/config";
import { realAppDbName } from "./lib/temp-db-guardrails";
import { backupDatabase } from "./lib/db-backup";
import { recordBackupRun } from "@/lib/observability/backup-metrics";

/**
 * Sauvegarde PostgreSQL réelle (v1.2, AR-0166). Usage :
 *   npx tsx scripts/backup-database.ts [répertoire de sortie]
 * (défaut : `./backups`, ou `BACKUP_DIR`).
 *
 * Une sauvegarde produite ici n'est JAMAIS déclarée valide par ce seul
 * script — voir `scripts/verify-database-backup.ts`, qui restaure
 * réellement le fichier dans une base temporaire jetable avant de le
 * confirmer exploitable (voir docs/operations/BACKUP_RESTORE.md).
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement requise absente : ${name}`);
  return value;
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const outputDir = process.argv[2] || process.env.BACKUP_DIR || "./backups";
  const startedAt = new Date();

  console.log(`→ Sauvegarde de la base "${realAppDbName(databaseUrl)}" vers ${outputDir}...`);
  try {
    const { dumpPath, metadata } = backupDatabase(outputDir, databaseUrl);

    console.log(`✅ Sauvegarde créée : ${dumpPath} (${(metadata.sizeBytes / 1024 / 1024).toFixed(2)} Mo)`);
    console.log(`   Empreinte SHA-256 : ${metadata.sha256}`);
    console.log(
      `\n⚠️  Cette sauvegarde n'est PAS encore déclarée valide. Exécutez :\n   npx tsx scripts/verify-database-backup.ts "${dumpPath}"\n   pour le confirmer par une restauration réelle sur une base temporaire jetable.`
    );
    await recordBackupRun({ kind: "DATABASE_DUMP", success: true, startedAt, finishedAt: new Date(), sizeBytes: metadata.sizeBytes, sha256: metadata.sha256 });
  } catch (err) {
    await recordBackupRun({
      kind: "DATABASE_DUMP",
      success: false,
      startedAt,
      finishedAt: new Date(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
