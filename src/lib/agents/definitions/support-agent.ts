import "server-only";
import { createSimpleAgentRuntime } from "@/lib/agents/shared/simple-runtime";

export const SUPPORT_AGENT_RUNTIME_KEY = "support.support-agent";

const ACTIONS = ["summarize_conversation", "draft_reply"] as const;

/**
 * Agent Support (v0.9) — résume l'historique réel des échanges d'un
 * prospect/client (`Conversation`/`Message`), rédige une réponse (jamais
 * envoyée automatiquement, ADR 0017). Promeut le stub `future-support-agent`
 * (v0.4) en agent réellement implémenté (ADR 0012). Voir
 * `tools/support-tools.ts` et ADR 0038 §agents métier.
 */
export const supportAgentRuntime = createSimpleAgentRuntime({
  runtimeKey: SUPPORT_AGENT_RUNTIME_KEY,
  toolPrefix: "support",
  actions: ACTIONS,
});
