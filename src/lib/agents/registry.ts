import "server-only";
import { logger } from "@/lib/logger";
import type { AgentRuntime } from "./types";

/**
 * Registre en mémoire des runtimes d'agent (`AgentDefinition.runtimeKey` ->
 * implémentation TypeScript). Le catalogue en base (`AgentDefinition`) ne
 * contient jamais de code exécutable — voir ADR 0007.
 *
 * `Map.set` est idempotent : un module réenregistré (rechargement à chaud
 * en développement) écrase simplement l'entrée précédente, il ne lève pas
 * d'exception — indispensable pour survivre au hot-reload de Turbopack.
 */
const runtimes = new Map<string, AgentRuntime>();

export function registerAgentRuntime(runtime: AgentRuntime) {
  if (runtimes.has(runtime.runtimeKey)) {
    logger.debug({ runtimeKey: runtime.runtimeKey }, "Runtime d'agent réenregistré (remplace le précédent).");
  }
  runtimes.set(runtime.runtimeKey, runtime);
}

export function getAgentRuntime(runtimeKey: string): AgentRuntime | undefined {
  return runtimes.get(runtimeKey);
}

export function listRegisteredRuntimeKeys(): string[] {
  return Array.from(runtimes.keys());
}
