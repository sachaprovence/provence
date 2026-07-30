import "server-only";
import { logger } from "@/lib/logger";

/**
 * Système de plugins pour les actions (voir brief v0.6). Chaque action est
 * une clé enregistrée une fois (`registerWorkflowAction`), jamais codée en
 * dur dans le moteur d'exécution — même principe Map que
 * `agents/tool-registry.ts` (v0.3). Ajouter une action = écrire un
 * `WorkflowActionHandler` et l'enregistrer, sans jamais modifier
 * `execution-engine.ts`.
 */
export type WorkflowLogLevel = "debug" | "info" | "warn" | "error";

export type WorkflowActionContext = {
  organizationId: string;
  workspaceId: string;
  runId: string;
  nodeId: string;
  /** Définit une variable de portée `workflow.<name>`, visible par les noeuds suivants — seule l'action `variable.set` s'en sert. */
  setVariable: (name: string, value: unknown) => void;
  log: (level: WorkflowLogLevel, message: string, metadata?: Record<string, unknown>) => Promise<void>;
};

export interface WorkflowActionHandler<TInput = unknown, TOutput = unknown> {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  execute(input: TInput, context: WorkflowActionContext): Promise<TOutput>;
}

const handlers = new Map<string, WorkflowActionHandler>();

export function registerWorkflowAction(handler: WorkflowActionHandler): void {
  if (handlers.has(handler.key)) {
    logger.debug({ key: handler.key }, "Action de workflow réenregistrée (remplace la précédente).");
  }
  handlers.set(handler.key, handler);
}

export function getWorkflowAction(key: string): WorkflowActionHandler | undefined {
  return handlers.get(key);
}

export function listWorkflowActions(): WorkflowActionHandler[] {
  return Array.from(handlers.values());
}
