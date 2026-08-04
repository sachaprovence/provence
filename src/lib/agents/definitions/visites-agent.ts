import "server-only";
import { createSimpleAgentRuntime } from "@/lib/agents/shared/simple-runtime";

export const VISITES_AGENT_RUNTIME_KEY = "visites.visites-agent";

const ACTIONS = ["detect_stalled_tours", "request_technician_followup", "advance_status"] as const;

/**
 * Agent Visites (v1.1, AR-0174) — surveille le cycle de vie des visites 3D
 * elles-mêmes (`VirtualTour` réel) : détecte les visites bloquées trop
 * longtemps à un statut (`SCHEDULED` dépassée, `SHOOTING_DONE` non
 * traitée, `PROCESSING` non publiée), et peut proposer une relance
 * technicien ou déclencher un changement de statut. Voir
 * `tools/visites-tools.ts` et ADR 0038 §agents métier.
 */
export const visitesAgentRuntime = createSimpleAgentRuntime({
  runtimeKey: VISITES_AGENT_RUNTIME_KEY,
  toolPrefix: "visites",
  actions: ACTIONS,
});
