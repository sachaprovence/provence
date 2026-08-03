import "server-only";
import { logger } from "@/lib/logger";
import type { ToolHandler } from "./types";

/**
 * Registre en mémoire des implémentations d'outils (`AgentTool.key` ->
 * handler). Ajouter un nouvel outil = ajouter une ligne `AgentTool` (voir
 * `prisma/seed.ts` / migration) + appeler `registerToolHandler` une fois au
 * démarrage (`src/lib/agents/bootstrap.ts`) — jamais de modification des
 * services existants.
 */
const handlers = new Map<string, ToolHandler>();

export function registerToolHandler(handler: ToolHandler) {
  if (handlers.has(handler.key)) {
    logger.debug({ toolKey: handler.key }, "Handler d'outil réenregistré (remplace le précédent).");
  }
  handlers.set(handler.key, handler);
}

export function getToolHandler(toolKey: string): ToolHandler | undefined {
  return handlers.get(toolKey);
}

export function listRegisteredToolKeys(): string[] {
  return Array.from(handlers.keys());
}
