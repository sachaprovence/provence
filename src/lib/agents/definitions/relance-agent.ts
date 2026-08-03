import "server-only";
import { createSimpleAgentRuntime } from "@/lib/agents/shared/simple-runtime";

export const RELANCE_AGENT_RUNTIME_KEY = "relance.relance-agent";

const ACTIONS = ["find_stale_leads", "draft_followup"] as const;

/**
 * Agent Relance (v0.9) — identifie les prospects restés sans réponse
 * (`Lead` réel) en dehors de toute séquence programmée, rédige une relance
 * ponctuelle (jamais envoyée automatiquement, ADR 0017). Complémentaire du
 * moteur de séquences (relances automatiques déjà programmées) — voir
 * `tools/relance-tools.ts` et ADR 0038 §agents métier.
 */
export const relanceAgentRuntime = createSimpleAgentRuntime({
  runtimeKey: RELANCE_AGENT_RUNTIME_KEY,
  toolPrefix: "relance",
  actions: ACTIONS,
});
