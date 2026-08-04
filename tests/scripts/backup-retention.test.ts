import { describe, expect, it } from "vitest";
import { computeRetentionPlan, MIN_KEEP, type BackupFileInfo } from "../../scripts/lib/backup-retention";

/**
 * Politique de rétention des sauvegardes (v1.3, AR-0175) — voir
 * `scripts/prune-old-backups.ts` pour le point d'entrée CLI (dry-run par
 * défaut, `--apply` pour supprimer réellement).
 */
function backup(overrides: Partial<BackupFileInfo> & { dumpPath: string }): BackupFileInfo {
  return { createdAt: new Date(), restoreVerified: true, sizeBytes: 1024, ...overrides };
}

const NOW = new Date("2026-06-01T00:00:00.000Z");
function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

describe("computeRetentionPlan (AR-0175)", () => {
  it("ne purge jamais une sauvegarde non vérifiée, quel que soit son âge", () => {
    const backups = [backup({ dumpPath: "old-unverified.dump", createdAt: daysAgo(365), restoreVerified: false })];
    const plan = computeRetentionPlan(backups, 30, NOW);
    expect(plan.toDelete).toHaveLength(0);
    expect(plan.keptUnverified.map((b) => b.dumpPath)).toEqual(["old-unverified.dump"]);
  });

  it(`conserve toujours les ${MIN_KEEP} sauvegardes vérifiées les plus récentes, même très anciennes`, () => {
    const backups = Array.from({ length: MIN_KEEP }, (_, i) => backup({ dumpPath: `b${i}.dump`, createdAt: daysAgo(1000 + i) }));
    const plan = computeRetentionPlan(backups, 30, NOW);
    expect(plan.toDelete).toHaveLength(0);
    expect(plan.keptByMinimum).toHaveLength(MIN_KEEP);
  });

  it("purge une sauvegarde vérifiée, au-delà du minimum conservé, plus ancienne que la fenêtre de rétention", () => {
    const recent = Array.from({ length: MIN_KEEP }, (_, i) => backup({ dumpPath: `recent-${i}.dump`, createdAt: daysAgo(i) }));
    const old = backup({ dumpPath: "very-old.dump", createdAt: daysAgo(60) });
    const plan = computeRetentionPlan([...recent, old], 30, NOW);
    expect(plan.toDelete.map((b) => b.dumpPath)).toEqual(["very-old.dump"]);
  });

  it("conserve une sauvegarde vérifiée au-delà du minimum mais encore dans la fenêtre de rétention", () => {
    const recent = Array.from({ length: MIN_KEEP }, (_, i) => backup({ dumpPath: `recent-${i}.dump`, createdAt: daysAgo(i) }));
    const withinWindow = backup({ dumpPath: "within-window.dump", createdAt: daysAgo(10) });
    const plan = computeRetentionPlan([...recent, withinWindow], 30, NOW);
    expect(plan.toDelete).toHaveLength(0);
    expect(plan.keptWithinRetention.map((b) => b.dumpPath)).toEqual(["within-window.dump"]);
  });

  it("ne purge rien si le nombre total de sauvegardes vérifiées est inférieur ou égal au minimum", () => {
    const backups = [backup({ dumpPath: "a.dump", createdAt: daysAgo(500) }), backup({ dumpPath: "b.dump", createdAt: daysAgo(600) })];
    const plan = computeRetentionPlan(backups, 30, NOW);
    expect(plan.toDelete).toHaveLength(0);
  });
});
