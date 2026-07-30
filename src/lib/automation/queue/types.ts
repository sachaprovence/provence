import "server-only";

/**
 * Queue Manager (Automation Engine, v0.8) : abstraction du mécanisme de
 * DÉCOUVERTE du travail prêt à traiter — jamais du stockage durable, qui
 * reste toujours `AutomationJob` (Postgres), quel que soit le fournisseur
 * actif (voir ADR 0032). Un fournisseur "push" (BullMQ, SQS, Kafka...)
 * utiliserait `notify` pour réveiller ses workers ; un fournisseur "poll"
 * (Postgres, le défaut) ignore `notify` et découvre le travail par requête
 * périodique dans `claim`.
 */
export type QueuedJobRef = { id: string; jobType: string; priority: number };

export interface QueueProvider {
  readonly key: string;
  /** Best-effort : signale qu'un job vient de devenir prêt. */
  notify(job: QueuedJobRef): Promise<void>;
  /** Réclame atomiquement jusqu'à `limit` jobs prêts — jamais deux fois le même job à deux appelants concurrents. */
  claim(params: { limit: number; workerId: string; jobTypes?: string[] }): Promise<QueuedJobRef[]>;
}
