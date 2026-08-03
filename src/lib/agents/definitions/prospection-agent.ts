import "server-only";
import { createSimpleAgentRuntime } from "@/lib/agents/shared/simple-runtime";

export const PROSPECTION_AGENT_RUNTIME_KEY = "prospection.prospection-agent";

const ACTIONS = ["find_priority_leads", "score_lead", "draft_outreach"] as const;

/**
 * Agent Prospection (v0.9) — identifie et priorise les prospects
 * existants les plus prometteurs (`Lead` réel, scoring réel), rédige le
 * premier message de prise de contact (jamais envoyé automatiquement,
 * voir ADR 0017). Voir `tools/prospection-tools.ts` et ADR 0038 §agents
 * métier.
 */
export const prospectionAgentRuntime = createSimpleAgentRuntime({
  runtimeKey: PROSPECTION_AGENT_RUNTIME_KEY,
  toolPrefix: "prospection",
  actions: ACTIONS,
});
