import "server-only";
import { logger } from "@/lib/logger";

/**
 * Registre déclaratif des types de déclencheurs disponibles pour l'éditeur
 * de workflow (palette de blocs) — même principe Map que
 * `agents/registry.ts`. Ce registre décrit ce qui EXISTE, il ne gate rien :
 * `triggerWorkflowsForEvent` (voir `trigger-engine.ts`) accepte n'importe
 * quelle `eventKey` même non enregistrée ici, pour rester extensible sans
 * devoir modifier ce fichier à chaque nouvel évènement applicatif. Un
 * déclencheur non enregistré fonctionne, il n'apparaît simplement pas dans
 * la palette avec un nom/description lisibles.
 */
export type TriggerTypeDefinition = {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  /** "event" (déclenché par `triggerWorkflowsForEvent`), "schedule" (cron/horaire), "manual" (déclenchement utilisateur), "webhook". */
  readonly kind: "event" | "schedule" | "manual" | "webhook";
};

const triggerTypes = new Map<string, TriggerTypeDefinition>();

export function registerTriggerType(definition: TriggerTypeDefinition): void {
  if (triggerTypes.has(definition.key)) {
    logger.debug({ key: definition.key }, "Type de déclencheur réenregistré (remplace le précédent).");
  }
  triggerTypes.set(definition.key, definition);
}

export function getTriggerType(key: string): TriggerTypeDefinition | undefined {
  return triggerTypes.get(key);
}

export function listTriggerTypes(): TriggerTypeDefinition[] {
  return Array.from(triggerTypes.values());
}
