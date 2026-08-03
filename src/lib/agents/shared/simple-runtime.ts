import "server-only";
import { ValidationError } from "@/lib/errors";
import type { AgentRuntime } from "@/lib/agents/types";

/**
 * Fabrique de runtime pour un agent métier "simple" (v0.9) : l'entrée est
 * `{ action: "<suffixe>", ...params }`, dispatché directement vers l'outil
 * `"<toolPrefix>.<action>"` correspondant. Évite de répéter la même
 * boucle dispatch/validation dans les 7 nouveaux agents métier — chacun
 * ne déclare que son préfixe d'outils et la liste de ses actions
 * possibles (voir `definitions/*-agent.ts`).
 */
export function createSimpleAgentRuntime(params: { runtimeKey: string; toolPrefix: string; actions: readonly string[] }): AgentRuntime {
  return {
    runtimeKey: params.runtimeKey,

    async execute(context) {
      const input = (context.input ?? {}) as { action?: string; [key: string]: unknown };
      if (!input.action || !params.actions.includes(input.action)) {
        throw new ValidationError(`Action invalide. Actions possibles : ${params.actions.join(", ")}.`);
      }

      await context.log("info", `Action demandée : "${input.action}".`);
      const { action, ...rest } = input;
      void action;
      const output = await context.callTool(`${params.toolPrefix}.${input.action}`, rest);
      await context.log("info", `Action "${input.action}" terminée.`);

      return { output };
    },
  };
}
