import "server-only";
import { prisma } from "@/lib/prisma";
import type { QueueProvider, QueuedJobRef } from "../types";

/**
 * Fournisseur en mémoire (par processus) : découvre le travail via une
 * file interne triée par priorité plutôt que par scrutation SQL — latence
 * de réclamation quasi nulle sur UNE seule instance, sans jamais changer
 * la source de vérité durable (`AutomationJob` reste toujours écrit par le
 * Job Executor, quel que soit le fournisseur — voir ADR 0032). Limite
 * assumée et documentée : la file interne n'est PAS partagée entre
 * processus/instances — un déploiement multi-instance doit utiliser
 * `postgres` (le défaut) ou un futur fournisseur distribué réel.
 */
export class MemoryQueueProvider implements QueueProvider {
  readonly key = "memory";
  private ready: QueuedJobRef[] = [];

  async notify(job: QueuedJobRef): Promise<void> {
    this.ready.push(job);
    this.ready.sort((a, b) => b.priority - a.priority);
  }

  async claim(params: { limit: number; workerId: string; jobTypes?: string[] }): Promise<QueuedJobRef[]> {
    const matches: QueuedJobRef[] = [];
    const remaining: QueuedJobRef[] = [];
    for (const job of this.ready) {
      if (matches.length < params.limit && (!params.jobTypes || params.jobTypes.includes(job.jobType))) {
        matches.push(job);
      } else {
        remaining.push(job);
      }
    }
    this.ready = remaining;
    if (matches.length === 0) return [];

    await prisma.automationJob.updateMany({
      where: { id: { in: matches.map((m) => m.id) }, status: "QUEUED" },
      data: { status: "CLAIMED", claimedAt: new Date(), claimedBy: params.workerId },
    });

    // Ne renvoie que les jobs réellement réclamés par CE worker (un autre
    // processus a pu, entre-temps, agir directement sur la table) — `IN`
    // ne garantissant aucun ordre, on refiltre `matches` (déjà trié par
    // priorité) plutôt que de faire confiance à l'ordre renvoyé par la BDD.
    const confirmed = await prisma.automationJob.findMany({
      where: { id: { in: matches.map((m) => m.id) }, status: "CLAIMED", claimedBy: params.workerId },
      select: { id: true },
    });
    const confirmedIds = new Set(confirmed.map((c) => c.id));
    return matches.filter((m) => confirmedIds.has(m.id));
  }

  /** Utilisé par les tests pour repartir d'un état propre entre deux scénarios. */
  clear(): void {
    this.ready = [];
  }
}
