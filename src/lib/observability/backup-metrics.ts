import { prisma } from "@/lib/prisma";
import type { BackupRunKind } from "@/generated/prisma/enums";

/**
 * Historique durable des exécutions de sauvegarde/vérification (v1.3,
 * AR-0174) — jusqu'ici seulement consigné dans un fichier `.meta.json`
 * local au répertoire de sauvegarde (perdu si ce répertoire n'est pas
 * conservé entre exécutions/instances). Réglage de DÉPLOIEMENT (une seule
 * base par instance), jamais par organisation.
 *
 * Volontairement SANS `import "server-only"` (contrairement à
 * `api-metrics.ts`) : les seuls consommateurs sont les scripts CLI de
 * sauvegarde (`scripts/backup-*.ts`, `scripts/verify-*.ts`), exécutés hors
 * du serveur Next.js — jamais importé depuis une page/un composant, donc
 * aucun risque d'être embarqué par erreur dans le bundle client.
 *
 * `recordBackupRun` ne doit jamais faire échouer l'appelant (même
 * discipline que `recordApiMetric`/`captureExceptionBestEffort`) : un échec
 * d'enregistrement de métrique ne doit jamais transformer une sauvegarde
 * par ailleurs réussie en échec apparent.
 */
export interface RecordBackupRunParams {
  kind: BackupRunKind;
  success: boolean;
  startedAt: Date;
  finishedAt: Date;
  sizeBytes?: number;
  sha256?: string;
  errorMessage?: string;
}

export async function recordBackupRun(params: RecordBackupRunParams): Promise<void> {
  try {
    await prisma.backupRun.create({
      data: {
        kind: params.kind,
        success: params.success,
        startedAt: params.startedAt,
        finishedAt: params.finishedAt,
        durationMs: params.finishedAt.getTime() - params.startedAt.getTime(),
        sizeBytes: params.sizeBytes,
        sha256: params.sha256,
        errorMessage: params.errorMessage,
      },
    });
  } catch {
    // Best-effort volontaire : voir la documentation ci-dessus.
  }
}

export interface BackupKindSummary {
  kind: BackupRunKind;
  lastRun: { success: boolean; finishedAt: Date; durationMs: number; errorMessage: string | null } | null;
  runCount: number;
  successRate: number | null;
  averageDurationMs: number | null;
}

/** Résumé par type de sauvegarde sur la fenêtre donnée — jamais un agrégat inter-organisation exposé côté client (voir l'en-tête du module). */
export async function getBackupMetrics(sinceDays = 30): Promise<BackupKindSummary[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const kinds: BackupRunKind[] = ["DATABASE_DUMP", "DATABASE_RESTORE_VERIFY", "S3_BACKUP", "S3_RESTORE_VERIFY"];

  return Promise.all(
    kinds.map(async (kind): Promise<BackupKindSummary> => {
      const runs = await prisma.backupRun.findMany({
        where: { kind, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        select: { success: true, finishedAt: true, durationMs: true, errorMessage: true },
      });
      const lastRun = runs[0] ?? null;
      const successCount = runs.filter((r) => r.success).length;
      const averageDurationMs = runs.length > 0 ? runs.reduce((sum, r) => sum + r.durationMs, 0) / runs.length : null;

      return {
        kind,
        lastRun,
        runCount: runs.length,
        successRate: runs.length > 0 ? successCount / runs.length : null,
        averageDurationMs,
      };
    })
  );
}
