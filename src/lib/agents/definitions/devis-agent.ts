import "server-only";
import { createSimpleAgentRuntime } from "@/lib/agents/shared/simple-runtime";

export const DEVIS_AGENT_RUNTIME_KEY = "devis.devis-agent";

const ACTIONS = ["draft_quote", "send_quote", "recommend_pricing"] as const;

/**
 * Agent Devis (v0.9) — crée et envoie de vrais `Quote` via le service de
 * devis réel (task #83), recommande une approche tarifaire. Voir
 * `tools/devis-tools.ts` et ADR 0038 §agents métier.
 */
export const devisAgentRuntime = createSimpleAgentRuntime({
  runtimeKey: DEVIS_AGENT_RUNTIME_KEY,
  toolPrefix: "devis",
  actions: ACTIONS,
});
