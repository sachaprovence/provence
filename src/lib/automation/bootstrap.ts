import "server-only";
import { registerBuiltInAutomationTriggers } from "./triggers";
import { registerBuiltInAutomationActions } from "./actions";
import { registerBuiltInQueueProviders } from "./queue";
import { registerBuiltInLockManagers } from "./lock";
import { subscribeAutomationTriggerEvents } from "./trigger-engine";

let registered = false;

/**
 * Enregistrement idempotent de TOUS les registres de l'Automation Engine
 * (types de déclencheurs, jobs/actions, fournisseurs de file, gestionnaires
 * de verrous, abonnement aux évènements réellement émis) — appelé
 * défensivement au point d'usage (`executor/job-executor.ts`), pas
 * seulement au démarrage du serveur : même leçon que l'ADR 0013 (v0.4),
 * réappliquée par `workflows/bootstrap.ts` (v0.6) — Next.js peut charger ce
 * module dans un contexte d'exécution distinct de celui qui a appelé cette
 * fonction au boot.
 */
export function registerBuiltInAutomationComponents(): void {
  if (registered) return;
  registered = true;

  registerBuiltInAutomationTriggers();
  registerBuiltInAutomationActions();
  registerBuiltInQueueProviders();
  registerBuiltInLockManagers();
  subscribeAutomationTriggerEvents();
}
