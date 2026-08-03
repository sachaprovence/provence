import "server-only";
import { createSimpleAgentRuntime } from "@/lib/agents/shared/simple-runtime";

export const SOCIAL_AGENT_RUNTIME_KEY = "social.social-agent";

const ACTIONS = ["list_recent_published_tours", "draft_post"] as const;

/**
 * Agent Réseaux sociaux (v0.9) — rédige des publications pour de vraies
 * `VirtualTour` publiées. La publication réelle sur les réseaux sociaux
 * reste un stub honnête (aucune API Meta/LinkedIn/TikTok disponible, voir
 * ADR 0038 §Communication Hub). Voir `tools/social-tools.ts`.
 */
export const socialAgentRuntime = createSimpleAgentRuntime({
  runtimeKey: SOCIAL_AGENT_RUNTIME_KEY,
  toolPrefix: "social",
  actions: ACTIONS,
});
