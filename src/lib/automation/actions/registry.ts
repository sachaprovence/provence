import "server-only";
import { logger } from "@/lib/logger";

/**
 * Registre des types de jobs/actions exécutables par le Job Executor
 * (Automation Engine, v0.8) — même principe Map que
 * `workflows/actions/registry.ts` (v0.6) : ajouter une action = écrire un
 * `AutomationJobHandler` et l'enregistrer, jamais modifier le Job
 * Executor. Les noeuds de contrôle de flux (trigger/condition/switch/
 * loop/map/wait/join/subautomation/end) sont gérés directement par le Job
 * Executor (comme `executeGraphNode` le fait pour le Workflow Engine) —
 * ce registre ne couvre que les jobs "action" réellement pluggables.
 */
export type AutomationJobLogLevel = "debug" | "info" | "warn" | "error";

export type AutomationJobContext = {
  organizationId: string;
  workspaceId: string;
  jobId: string;
  runId?: string;
  nodeId?: string;
  /** Définit une variable de portée `workflow.<name>` du run courant, visible par les noeuds suivants (voir `variable.set`). */
  setVariable: (name: string, value: unknown) => void;
  log: (level: AutomationJobLogLevel, message: string, metadata?: Record<string, unknown>) => Promise<void>;
};

export interface AutomationJobHandler<TInput = unknown, TOutput = unknown> {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  execute(input: TInput, context: AutomationJobContext): Promise<TOutput>;
}

const handlers = new Map<string, AutomationJobHandler>();

export function registerAutomationJobHandler(handler: AutomationJobHandler): void {
  if (handlers.has(handler.key)) {
    logger.debug({ key: handler.key }, "Gestionnaire de job d'automatisation réenregistré (remplace le précédent).");
  }
  handlers.set(handler.key, handler);
}

export function getAutomationJobHandler(key: string): AutomationJobHandler | undefined {
  return handlers.get(key);
}

export function listAutomationJobHandlers(): AutomationJobHandler[] {
  return Array.from(handlers.values());
}
