import "server-only";
import { createSimpleAgentRuntime } from "@/lib/agents/shared/simple-runtime";

export const ANALYSE_AGENT_RUNTIME_KEY = "analyse.analyse-agent";

const ACTIONS = ["generate_report", "detect_stalled_leads"] as const;

/**
 * Agent Analyse (v0.9) — génère un rapport narratif à partir des VRAIES
 * statistiques déjà calculées (`@/lib/stats`), détecte les prospects
 * réellement bloqués dans le pipeline. Promeut le stub
 * `future-analyse-agent` (v0.4) en agent réellement implémenté (ADR 0012).
 * Voir `tools/analyse-tools.ts` et ADR 0038 §agents métier.
 */
export const analyseAgentRuntime = createSimpleAgentRuntime({
  runtimeKey: ANALYSE_AGENT_RUNTIME_KEY,
  toolPrefix: "analyse",
  actions: ACTIONS,
});
