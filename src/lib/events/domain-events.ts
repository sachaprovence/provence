import "server-only";
import { logger } from "@/lib/logger";

/**
 * Bus d'évènements applicatifs générique, en mémoire, sans dépendance à
 * aucun module métier ni au Framework des Agents ni au Workflow Engine.
 * Rôle unique : permettre à un module d'annoncer "il s'est passé quelque
 * chose" sans avoir à connaître qui, éventuellement, s'y intéresse — ni
 * l'inverse. Utilisé pour découpler `agents/execution-engine.ts` (qui
 * publie la fin d'une exécution d'agent) du Workflow Engine (v0.6, qui s'y
 * abonne pour le déclencheur "Exécution d'un agent"), sans jamais créer de
 * dépendance de compilation entre les deux — voir ADR 0018.
 */

export type DomainEventPayload = Record<string, unknown>;
export type DomainEventListener = (payload: DomainEventPayload) => void | Promise<void>;

const listeners = new Map<string, Set<DomainEventListener>>();

export function subscribeDomainEvent(eventKey: string, listener: DomainEventListener): void {
  if (!listeners.has(eventKey)) listeners.set(eventKey, new Set());
  listeners.get(eventKey)!.add(listener);
}

export function unsubscribeDomainEvent(eventKey: string, listener: DomainEventListener): void {
  listeners.get(eventKey)?.delete(listener);
}

/**
 * Publie un évènement. Chaque abonné est invoqué séquentiellement et de
 * façon isolée : une exception dans un abonné est journalisée et ignorée,
 * elle ne remonte jamais à l'émetteur et n'empêche jamais les autres
 * abonnés de s'exécuter — un module qui publie un évènement ne doit jamais
 * pouvoir échouer à cause d'un abonné tiers.
 */
export async function publishDomainEvent(eventKey: string, payload: DomainEventPayload): Promise<void> {
  const subscribed = listeners.get(eventKey);
  if (!subscribed || subscribed.size === 0) return;
  for (const listener of subscribed) {
    try {
      await listener(payload);
    } catch (error) {
      logger.error(
        { module: "domain-events", eventKey, err: error },
        "Un abonné à l'évènement a levé une exception (ignorée)."
      );
    }
  }
}

/** Utilisé par les tests pour repartir d'un état propre entre deux scénarios. */
export function clearAllDomainEventListeners(): void {
  listeners.clear();
}

export function listSubscribedEventKeys(): string[] {
  return Array.from(listeners.keys());
}
