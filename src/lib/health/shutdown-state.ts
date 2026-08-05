import "server-only";

/**
 * État d'arrêt en cours (v1.3, AR-0173) — un simple booléen en mémoire,
 * posé dès la réception de SIGTERM/SIGINT (voir `src/instrumentation.ts`),
 * AVANT que le serveur HTTP ne finisse de drainer les requêtes en cours.
 *
 * But : `evaluateReadiness()` (`/api/health/ready`) doit basculer sur
 * "non prêt" IMMÉDIATEMENT à la réception du signal — pas seulement une
 * fois le processus terminé — pour qu'un orchestrateur (Kubernetes,
 * load balancer) cesse de router du NOUVEAU trafic vers cette instance dès
 * le début de sa période de grâce, pendant que Next.js termine les
 * requêtes déjà acceptées (voir doc Next.js sur l'arrêt propre de
 * `next start` : `server.close()` cesse d'accepter de nouvelles connexions
 * mais laisse les requêtes en cours se terminer). Sans ce signal précoce,
 * un rolling update pourrait continuer à envoyer de nouvelles requêtes à
 * une instance déjà en train de s'arrêter jusqu'à ce que la sonde de
 * disponibilité échoue par un autre moyen (ex. connexion refusée), ce qui
 * est plus tardif et moins fiable.
 */
let shuttingDown = false;

export function markShuttingDown(): void {
  shuttingDown = true;
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}

/** Réservé aux tests — jamais appelé par le code applicatif. */
export function resetShutdownStateForTests(): void {
  shuttingDown = false;
}
