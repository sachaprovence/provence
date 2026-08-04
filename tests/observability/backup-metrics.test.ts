import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getBackupMetrics, recordBackupRun } from "@/lib/observability/backup-metrics";

/**
 * Historique durable des sauvegardes (v1.3, AR-0174) — voir
 * `scripts/backup-database.ts`/`verify-database-backup.ts`/
 * `backup-s3-objects.ts`/`verify-s3-backup.ts` pour les sites d'appel réels.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("recordBackupRun / getBackupMetrics (AR-0174)", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    await prisma.backupRun.deleteMany({ where: { id: { in: createdIds } } });
  });

  it("enregistre une sauvegarde réussie avec sa durée dérivée des horodatages", async () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const finishedAt = new Date("2026-01-01T00:00:05.000Z");
    await recordBackupRun({ kind: "DATABASE_DUMP", success: true, startedAt, finishedAt, sizeBytes: 1024, sha256: "abc123" });

    const run = await prisma.backupRun.findFirst({ where: { kind: "DATABASE_DUMP", sha256: "abc123" } });
    expect(run).not.toBeNull();
    createdIds.push(run!.id);
    expect(run!.success).toBe(true);
    expect(run!.durationMs).toBe(5000);
    expect(run!.sizeBytes).toBe(1024);
  });

  it("enregistre un échec avec le message d'erreur, sans sizeBytes/sha256", async () => {
    const startedAt = new Date("2026-01-02T00:00:00.000Z");
    const finishedAt = new Date("2026-01-02T00:00:01.000Z");
    await recordBackupRun({ kind: "S3_BACKUP", success: false, startedAt, finishedAt, errorMessage: "bucket introuvable" });

    const run = await prisma.backupRun.findFirst({ where: { kind: "S3_BACKUP", errorMessage: "bucket introuvable" } });
    expect(run).not.toBeNull();
    createdIds.push(run!.id);
    expect(run!.success).toBe(false);
    expect(run!.sizeBytes).toBeNull();
    expect(run!.sha256).toBeNull();
  });

  it("ne fait jamais échouer l'appelant même si l'écriture en base échoue (best-effort)", async () => {
    const spy = vi.spyOn(prisma.backupRun, "create").mockRejectedValueOnce(new Error("connexion perdue"));
    try {
      await expect(recordBackupRun({ kind: "DATABASE_DUMP", success: true, startedAt: new Date(), finishedAt: new Date() })).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
    }
  });

  it("getBackupMetrics résume par type : dernière exécution, taux de succès, durée moyenne", async () => {
    const kind = "DATABASE_RESTORE_VERIFY" as const;
    const t0 = new Date("2026-01-03T00:00:00.000Z");
    await recordBackupRun({ kind, success: true, startedAt: t0, finishedAt: new Date(t0.getTime() + 1000) });
    const t1 = new Date("2026-01-03T01:00:00.000Z");
    await recordBackupRun({ kind, success: false, startedAt: t1, finishedAt: new Date(t1.getTime() + 3000), errorMessage: "restauration incomplète" });

    const created = await prisma.backupRun.findMany({ where: { kind, createdAt: { gte: t0 } } });
    createdIds.push(...created.map((r) => r.id));

    const summaries = await getBackupMetrics(365);
    const summary = summaries.find((s) => s.kind === kind)!;
    expect(summary.runCount).toBeGreaterThanOrEqual(2);
    expect(summary.successRate).not.toBeNull();
    expect(summary.successRate).toBeLessThan(1); // au moins un échec parmi les runs créés
    expect(summary.lastRun).not.toBeNull();
    expect(summary.lastRun!.success).toBe(false); // le plus récent des deux (t1) est un échec
  });

  it("getBackupMetrics renvoie les 4 types même sans aucune exécution enregistrée pour l'un d'eux", async () => {
    const summaries = await getBackupMetrics(0); // fenêtre nulle : aucune exécution ne peut correspondre
    expect(summaries.map((s) => s.kind).sort()).toEqual(["DATABASE_DUMP", "DATABASE_RESTORE_VERIFY", "S3_BACKUP", "S3_RESTORE_VERIFY"].sort());
    for (const s of summaries) {
      expect(s.runCount).toBe(0);
      expect(s.lastRun).toBeNull();
      expect(s.successRate).toBeNull();
      expect(s.averageDurationMs).toBeNull();
    }
  });
});
