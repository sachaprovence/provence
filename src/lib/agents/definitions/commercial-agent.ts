import "server-only";
import { ValidationError } from "@/lib/errors";
import { commercialAgentInputSchema, type CommercialAgentInput } from "@/lib/validations/commercial";
import { COMMERCIAL_AGENT_RUNTIME_KEY } from "@/lib/agents/commercial/constants";
import type { AgentRuntime } from "@/lib/agents/types";

export { COMMERCIAL_AGENT_RUNTIME_KEY };

function parseInput(raw: unknown): CommercialAgentInput {
  const parsed = commercialAgentInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      `Entrée invalide pour l'Agent Commercial : ${parsed.error.issues.map((issue) => issue.message).join(", ")}`
    );
  }
  return parsed.data;
}

/** Traduit l'entrée de l'agent en entrée de l'outil `commercial.<action>` correspondant — dispatch simple, une action = un outil. */
function buildToolPayload(input: CommercialAgentInput): unknown {
  switch (input.action) {
    case "search_prospects":
      return { stage: input.stage, query: input.query };
    case "create_prospect":
      return input.data;
    case "enrich_prospect":
      return { prospectId: input.prospectId, ...input.data };
    case "qualify_prospect":
      return { prospectId: input.prospectId, stage: input.stage, notes: input.notes };
    case "draft_followup":
      return { prospectId: input.prospectId, previousSummary: input.previousSummary, objection: input.objection };
    case "draft_quote":
      return { prospectId: input.prospectId, amount: input.quote?.amount, currency: input.quote?.currency };
    default:
      return { prospectId: input.prospectId };
  }
}

/**
 * Agent Commercial (v0.5) — premier agent MÉTIER d'Autorun, construit
 * intégralement sur le Framework des Agents et délégable par l'Agent
 * Director (`targetCategory: "commercial"`, voir v0.4). Ne fait jamais
 * rien directement en base : chaque capacité passe par un outil
 * `commercial.*` (`tools/commercial-tools.ts`), lui-même vérifié par
 * `requireAgentToolPermission` (plafond de l'installation) — aucun
 * raccourci. Voir ADR 0014.
 */
export const commercialAgentRuntime: AgentRuntime = {
  runtimeKey: COMMERCIAL_AGENT_RUNTIME_KEY,

  async execute(context) {
    const input = parseInput(context.input);
    await context.log("info", `Action demandée : "${input.action}".`);

    if (input.action === "full_cycle") {
      const { prospect } = (await context.callTool("commercial.create_prospect", input.data)) as {
        prospect: { id: string };
      };
      await context.log("info", "Fiche prospect créée.", { prospectId: prospect.id });

      await context.callTool("commercial.qualify_prospect", {
        prospectId: prospect.id,
        stage: "QUALIFIED",
        notes: "Qualifié automatiquement dans le cadre d'un cycle complet.",
      });
      await context.log("info", "Prospect qualifié.");

      const { score } = (await context.callTool("commercial.score_prospect", { prospectId: prospect.id })) as {
        score: number;
      };
      await context.log("info", "Score attribué.", { score });

      await context.callTool("commercial.estimate_potential", { prospectId: prospect.id });
      const { action: emailAction } = (await context.callTool("commercial.draft_email", {
        prospectId: prospect.id,
      })) as { action: unknown };
      const { action: recommendation } = (await context.callTool("commercial.recommend_next_actions", {
        prospectId: prospect.id,
      })) as { action: unknown };

      await context.log("info", "Cycle complet terminé — email et recommandation en attente d'approbation.", {
        prospectId: prospect.id,
      });

      return { output: { prospectId: prospect.id, score, emailAction, recommendation } };
    }

    const toolKey = `commercial.${input.action}`;
    const output = await context.callTool(toolKey, buildToolPayload(input));
    return { output: output as Record<string, unknown> };
  },
};
