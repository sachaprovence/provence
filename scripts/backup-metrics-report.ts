import "dotenv/config";
import { getBackupMetrics } from "@/lib/observability/backup-metrics";

/**
 * Rapport CLI de l'historique des sauvegardes (v1.3, AR-0174) — lecture
 * seule de `BackupRun`, jamais un endpoint web : la sauvegarde est une
 * préoccupation d'exploitation (accès déploiement/base de données), pas
 * une métrique consultable par un administrateur d'organisation cliente
 * (réglage de déploiement, pas par organisation — voir
 * `src/lib/observability/backup-metrics.ts`).
 *
 * Usage : `npx tsx scripts/backup-metrics-report.ts [nombre de jours]`
 * (défaut : 30).
 */
const KIND_LABELS: Record<string, string> = {
  DATABASE_DUMP: "Sauvegarde PostgreSQL",
  DATABASE_RESTORE_VERIFY: "Vérification par restauration PostgreSQL",
  S3_BACKUP: "Sauvegarde S3",
  S3_RESTORE_VERIFY: "Vérification par aller-retour S3",
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

async function main() {
  const sinceDays = Number(process.argv[2] ?? "30");
  console.log(`→ Historique des sauvegardes sur les ${sinceDays} derniers jours...\n`);

  const summaries = await getBackupMetrics(sinceDays);
  let anyStale = false;

  for (const summary of summaries) {
    console.log(`${KIND_LABELS[summary.kind] ?? summary.kind} :`);
    console.log(`  exécutions : ${summary.runCount} (taux de succès : ${formatPercent(summary.successRate)})`);
    console.log(`  durée moyenne : ${formatDuration(summary.averageDurationMs)}`);
    if (summary.lastRun) {
      const ageHours = (Date.now() - summary.lastRun.finishedAt.getTime()) / (60 * 60 * 1000);
      console.log(
        `  dernière exécution : ${summary.lastRun.success ? "✅ succès" : "❌ échec"} le ${summary.lastRun.finishedAt.toISOString()} (il y a ${ageHours.toFixed(1)}h)`
      );
      if (!summary.lastRun.success && summary.lastRun.errorMessage) {
        console.log(`    erreur : ${summary.lastRun.errorMessage}`);
      }
    } else {
      console.log("  ⚠️  aucune exécution enregistrée sur cette fenêtre.");
      anyStale = true;
    }
    console.log("");
  }

  if (anyStale) {
    console.log("⚠️  Au moins un type de sauvegarde n'a aucune exécution récente enregistrée — vérifier la planification (cron/orchestrateur).");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\n❌ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
