import "server-only";
import { logger } from "@/lib/logger";

/**
 * Registre déclaratif des types de déclencheurs disponibles (Automation
 * Engine, v0.8) — même principe que `workflows/triggers/registry.ts`
 * (v0.6) : ce registre décrit ce qui EXISTE pour la palette de l'éditeur,
 * il ne gate rien. `fireAutomationEvent` (voir `trigger-engine.ts`)
 * accepte n'importe quelle `eventKey` même non enregistrée ici.
 */
export type AutomationTriggerTypeDefinition = {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly kind: "event" | "schedule" | "manual" | "webhook" | "api";
};

const triggerTypes = new Map<string, AutomationTriggerTypeDefinition>();

export function registerAutomationTriggerType(definition: AutomationTriggerTypeDefinition): void {
  if (triggerTypes.has(definition.key)) {
    logger.debug({ key: definition.key }, "Type de déclencheur d'automatisation réenregistré (remplace le précédent).");
  }
  triggerTypes.set(definition.key, definition);
}

export function getAutomationTriggerType(key: string): AutomationTriggerTypeDefinition | undefined {
  return triggerTypes.get(key);
}

export function listAutomationTriggerTypes(): AutomationTriggerTypeDefinition[] {
  return Array.from(triggerTypes.values());
}
