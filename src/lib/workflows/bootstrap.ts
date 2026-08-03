import "server-only";
import { registerBuiltInTriggerTypes } from "./triggers/builtin-triggers";
import { registerBuiltInWorkflowActions } from "./actions";
import { subscribeAgentRunFinishedTrigger } from "./trigger-engine";
import { ensureWorkflowTemplates } from "./templates/seed-templates";

let registered = false;

/**
 * Enregistrement idempotent des registres du Workflow Engine (types de
 * déclencheurs, actions, abonnement au bus d'évènements). Appelé
 * défensivement au point d'usage (`execution-engine.ts#executeWorkflowRun`),
 * pas seulement au démarrage du serveur — même leçon que l'ADR 0013 (v0.4) :
 * Next.js peut charger ce module dans un contexte d'exécution distinct de
 * celui qui a appelé cette fonction au boot (`instrumentation.ts`).
 */
export function registerBuiltInWorkflowComponents(): void {
  if (registered) return;
  registerBuiltInTriggerTypes();
  registerBuiltInWorkflowActions();
  subscribeAgentRunFinishedTrigger();
  registered = true;
}

/** Seed des templates (accède à la base, donc séparé de l'enregistrement en mémoire ci-dessus) — voir `instrumentation.ts`/`syncWorkflowCatalog`. */
export async function syncWorkflowCatalog(): Promise<void> {
  registerBuiltInWorkflowComponents();
  await ensureWorkflowTemplates();
}
