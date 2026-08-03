import "server-only";
import { createSimpleAgentRuntime } from "@/lib/agents/shared/simple-runtime";

export const PLANNING_AGENT_RUNTIME_KEY = "planning.planning-agent";

const ACTIONS = ["check_availability", "book_appointment", "suggest_slots"] as const;

/**
 * Agent Planning (v0.9) — vérifie les disponibilités (Google Calendar réel
 * ou repli sur les vrais rendez-vous enregistrés), réserve de vrais
 * `Appointment` synchronisés. Voir `tools/planning-tools.ts` et ADR 0038
 * §agents métier.
 */
export const planningAgentRuntime = createSimpleAgentRuntime({
  runtimeKey: PLANNING_AGENT_RUNTIME_KEY,
  toolPrefix: "planning",
  actions: ACTIONS,
});
