import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { realAppDbName } from "./lib/temp-db-guardrails";
import { backupDatabase } from "./lib/db-backup";

/**
 * Sauvegarde + vérification automatisées en UNE seule commande (v1.3,
 * AR-0175) — jusqu'ici deux commandes manuelles distinctes
 * (`backup-database.ts` puis `verify-database-backup.ts` avec le chemin du
 * fichier produit). Conçu pour une planification (cron/systemd timer, voir
 * docs/operations/BACKUP_RESTORE.md §9) : une seule ligne à programmer,
 * code de sortie non nul si l'UNE OU L'AUTRE étape échoue.
 *
 * Réutilise `backupDatabase()` directement (déjà testé, AR-0166) mais
 * relance `verify-database-backup.ts` en sous-processus plutôt que
 * dupliquer sa logique de restauration réelle (~80 lignes) — garde un seul
 * endroit qui sait restaurer/vérifier une sauvegarde PostgreSQL.
 *
 * Usage : `npx tsx scripts/run-scheduled-backup.ts [répertoire de sortie]`
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement requise absente : ${name}`);
  return value;
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const outputDir = process.argv[2] || process.env.BACKUP_DIR || "./backups";

  console.log(`→ [1/2] Sauvegarde de la base "${realAppDbName(databaseUrl)}" vers ${outputDir}...`);
  const { dumpPath, metadata } = backupDatabase(outputDir, databaseUrl);
  console.log(`  ✅ Sauvegarde créée : ${dumpPath} (${(metadata.sizeBytes / 1024 / 1024).toFixed(2)} Mo)`);

  console.log(`\n→ [2/2] Vérification par restauration réelle...`);
  const verifyScript = path.join(__dirname, "verify-database-backup.ts");
  const result = spawnSync("npx", ["tsx", verifyScript, dumpPath], { stdio: "inherit", env: process.env });

  if (result.status !== 0) {
    throw new Error(`La vérification de la sauvegarde a échoué (code ${result.status}) — voir la sortie ci-dessus.`);
  }

  console.log(`\n✅ Sauvegarde planifiée terminée avec succès : ${dumpPath} (vérifiée par restauration réelle).`);
}

main().catch((err) => {
  console.error(`\n❌ Sauvegarde planifiée en échec : ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
