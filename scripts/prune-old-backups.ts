import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { listBackups, computeRetentionPlan, MIN_KEEP } from "./lib/backup-retention";

/**
 * Politique de rétention des sauvegardes PostgreSQL (v1.3, AR-0175) —
 * aucune purge n'existait jusqu'ici : les fichiers `.dump` s'accumulaient
 * indéfiniment sur le volume de sauvegarde. Logique de décision dans
 * `scripts/lib/backup-retention.ts` (garde-fous détaillés là-bas).
 *
 * Mode SANS DANGER par défaut (dry-run) : affiche ce qui serait supprimé
 * sans rien supprimer. Ajouter `--apply` pour exécuter réellement la
 * suppression — une opération destructive (fichiers locaux, pas la base
 * applicative) qui ne doit jamais être le comportement par défaut d'un
 * script exécutable en CI/cron sans supervision.
 *
 * Usage :
 *   npx tsx scripts/prune-old-backups.ts [répertoire] [joursDeRétention] [--apply]
 *   (défaut : ./backups, 30 jours, dry-run)
 */
function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--apply");
  const apply = process.argv.includes("--apply");
  const dir = args[0] || process.env.BACKUP_DIR || "./backups";
  const retentionDays = Number(args[1] ?? "30");

  console.log(`→ Analyse des sauvegardes dans "${dir}" (rétention : ${retentionDays} jours, minimum conservé : ${MIN_KEEP})...`);
  const backups = listBackups(dir);
  console.log(`  ${backups.length} sauvegarde(s) avec métadonnées lisibles trouvée(s).`);

  if (fs.existsSync(dir)) {
    const allDumpFiles = fs.readdirSync(dir).filter((f) => f.endsWith(".dump")).map((f) => path.join(dir, f));
    const unreadable = allDumpFiles.filter((f) => !backups.some((b) => b.dumpPath === f));
    for (const f of unreadable) console.warn(`  ⚠️  métadonnées illisibles/absentes pour "${f}" — jamais supprimé sans métadonnées fiables.`);
  }
  console.log("");

  const plan = computeRetentionPlan(backups, retentionDays);

  for (const b of plan.keptUnverified) console.log(`  🛡️  conservée (jamais vérifiée par restauration) : ${b.dumpPath}`);
  for (const b of plan.keptByMinimum) console.log(`  🛡️  conservée (parmi les ${MIN_KEEP} plus récentes vérifiées) : ${b.dumpPath}`);
  for (const b of plan.keptWithinRetention) console.log(`  ✅ conservée (dans la fenêtre de rétention) : ${b.dumpPath}`);
  for (const b of plan.toDelete) {
    console.log(
      `  🗑️  ${apply ? "supprimée" : "à supprimer (dry-run)"} : ${b.dumpPath} (${(b.sizeBytes / 1024 / 1024).toFixed(2)} Mo, créée le ${b.createdAt.toISOString()})`
    );
  }

  if (plan.toDelete.length === 0) {
    console.log("\n✅ Rien à purger.");
    return;
  }

  if (!apply) {
    console.log(`\n⚠️  Mode dry-run (par défaut) — ${plan.toDelete.length} fichier(s) seraient supprimés. Relancer avec --apply pour exécuter réellement.`);
    return;
  }

  for (const b of plan.toDelete) {
    fs.unlinkSync(b.dumpPath);
    const metaPath = `${b.dumpPath}.meta.json`;
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
  }
  console.log(`\n✅ ${plan.toDelete.length} sauvegarde(s) purgée(s).`);
}

main();
