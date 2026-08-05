import fs from "node:fs";
import path from "node:path";
import { readBackupMetadata } from "./db-backup";

/**
 * Logique de rétention des sauvegardes PostgreSQL (v1.3, AR-0175) — extraite
 * sans `main()` (même convention que `db-backup.ts`) pour être importable
 * en sécurité par les tests. Le point d'entrée CLI est
 * `scripts/prune-old-backups.ts`.
 */
export const MIN_KEEP = 3;

export interface BackupFileInfo {
  dumpPath: string;
  createdAt: Date;
  restoreVerified: boolean;
  sizeBytes: number;
}

export function listBackups(dir: string): BackupFileInfo[] {
  if (!fs.existsSync(dir)) return [];
  const dumpFiles = fs.readdirSync(dir).filter((f) => f.endsWith(".dump"));
  const infos: BackupFileInfo[] = [];
  for (const file of dumpFiles) {
    const dumpPath = path.join(dir, file);
    try {
      const metadata = readBackupMetadata(dumpPath);
      infos.push({
        dumpPath,
        createdAt: new Date(metadata.createdAt),
        restoreVerified: metadata.restoreVerified === true,
        sizeBytes: metadata.sizeBytes,
      });
    } catch {
      // Métadonnées illisibles/absentes : jamais incluse dans la liste — un
      // fichier sans métadonnées fiables ne peut être ni conservé ni purgé
      // en toute sécurité par ce mécanisme (voir `prune-old-backups.ts` qui
      // journalise ce cas séparément, sans jamais y toucher).
    }
  }
  return infos.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export interface RetentionPlan {
  keptUnverified: BackupFileInfo[];
  keptByMinimum: BackupFileInfo[];
  keptWithinRetention: BackupFileInfo[];
  toDelete: BackupFileInfo[];
}

/**
 * Garde-fous, dans cet ordre de priorité (jamais contournables) :
 *   1. Jamais une sauvegarde non vérifiée par restauration réelle.
 *   2. Jamais les `MIN_KEEP` sauvegardes vérifiées les plus récentes,
 *      quel que soit leur âge.
 *   3. Au-delà, purge celles plus anciennes que `retentionDays`.
 */
export function computeRetentionPlan(backups: BackupFileInfo[], retentionDays: number, now: Date = new Date()): RetentionPlan {
  const sorted = [...backups].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const verified = sorted.filter((b) => b.restoreVerified);
  const keptUnverified = sorted.filter((b) => !b.restoreVerified);

  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const keptByMinimum = verified.slice(0, MIN_KEEP);
  const eligibleForPruning = verified.slice(MIN_KEEP);
  const toDelete = eligibleForPruning.filter((b) => b.createdAt < cutoff);
  const keptWithinRetention = eligibleForPruning.filter((b) => b.createdAt >= cutoff);

  return { keptUnverified, keptByMinimum, keptWithinRetention, toDelete };
}
