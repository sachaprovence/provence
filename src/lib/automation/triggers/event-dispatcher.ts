import "server-only";
import { publishDomainEvent, subscribeDomainEvent, type DomainEventPayload } from "@/lib/events/domain-events";

/**
 * Event Dispatcher (Automation Engine, v0.8) : réutilise directement le
 * bus d'évènements générique existant (`src/lib/events/domain-events.ts`,
 * v0.6) plutôt que de réimplémenter un second pub/sub — mêmes garanties
 * (abonnés isolés, jamais d'exception remontée à l'émetteur). Ce module
 * ne fait que nommer explicitement l'usage "déclencheurs
 * d'automatisation" du bus générique, pour que le composant "Event
 * Dispatcher" demandé par le brief soit identifiable sans dupliquer sa
 * logique — voir ADR 0034.
 */
/**
 * Assure défensivement que l'Automation Engine (dont l'abonnement du
 * Trigger Engine aux évènements réellement émis, voir `trigger-engine.ts`)
 * est enregistré avant de publier — import DYNAMIQUE délibéré : `bootstrap.ts`
 * importe `trigger-engine.ts`, qui importe CE module (`subscribeAutomationEvent`) ;
 * un import statique créerait un cycle, l'import dynamique le rompt (même
 * technique que `job-executor.ts` pour `agents/execution-engine`, voir
 * ADR 0018).
 */
export async function publishAutomationEvent(eventKey: string, payload: DomainEventPayload = {}): Promise<void> {
  const { registerBuiltInAutomationComponents } = await import("../bootstrap");
  registerBuiltInAutomationComponents();
  // Webhooks sortants (v1.0, AR-0061) — s'abonnent au même bus générique,
  // voir `src/lib/webhooks-outbound.ts`. Import dynamique pour la même
  // raison que ci-dessus (éviter tout cycle d'import statique).
  const { registerOutboundWebhookListeners } = await import("@/lib/webhooks-outbound");
  registerOutboundWebhookListeners();
  await publishDomainEvent(eventKey, payload);
}

export function subscribeAutomationEvent(eventKey: string, listener: (payload: DomainEventPayload) => void | Promise<void>): void {
  subscribeDomainEvent(eventKey, listener);
}
