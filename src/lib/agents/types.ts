import "server-only";
import type { AgentInstallation, AgentRun } from "@/generated/prisma/client";

export type AgentLogLevel = "debug" | "info" | "warn" | "error";

/**
 * Contexte fourni à un runtime d'agent pendant l'exécution d'un
 * `AgentRun`. C'est la **seule** porte d'entrée qu'un agent possède vers
 * le reste du système : il ne doit jamais importer `prisma` ou un module
 * métier directement (voir `docs/02-ARCHITECTURE.md` §10).
 */
export type AgentExecutionContext = {
  installation: AgentInstallation;
  run: AgentRun;
  input: unknown;
  /**
   * Invoque un outil déclaratif. Vérifie systématiquement que
   * l'installation y est autorisée (`AgentInstallation.grantedToolKeys`)
   * avant tout appel — jamais de contournement possible depuis un runtime.
   */
  callTool: (toolKey: string, input: unknown) => Promise<unknown>;
  /** Écrit une ligne de journal consultable depuis l'UI (`AgentRunLog`) et dans les logs structurés. */
  log: (level: AgentLogLevel, message: string, metadata?: Record<string, unknown>) => Promise<void>;
};

export type AgentExecutionResult = {
  output?: unknown;
  /** Si renseigné, une `AgentInterventionRequest` est créée après le run (voir `messaging.ts`). */
  interventionRequested?: { title: string; description?: string };
};

/**
 * Implémentation réelle (code) d'un agent référencé par
 * `AgentDefinition.runtimeKey`. Enregistré une fois via
 * `registerAgentRuntime` (`registry.ts`), jamais instancié directement par
 * les routes/services — voir ADR 0007.
 */
export interface AgentRuntime {
  readonly runtimeKey: string;
  execute(context: AgentExecutionContext): Promise<AgentExecutionResult>;
}

/**
 * Implémentation réelle (code) d'un outil référencé par `AgentTool.key`.
 * Enregistrée une fois via `registerToolHandler` (`tool-registry.ts`).
 */
export interface ToolHandler<TInput = unknown, TOutput = unknown> {
  readonly key: string;
  handle(input: TInput, context: { installation: AgentInstallation }): Promise<TOutput>;
}
