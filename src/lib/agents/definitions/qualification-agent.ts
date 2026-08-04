import "server-only";
import { ValidationError } from "@/lib/errors";
import { qualificationAgentInputSchema, type QualificationAgentInput } from "@/lib/validations/qualification";
import type { AgentRuntime } from "@/lib/agents/types";
import type { CommercialStage } from "@/generated/prisma/enums";

export const QUALIFICATION_AGENT_RUNTIME_KEY = "qualification.qualification-agent";

/**
 * Score (sur 100) à partir duquel un prospect passe `QUALIFIED` plutôt que
 * de rester `TO_QUALIFY` — seuil de décision propre à l'Agent Qualification,
 * le moteur de scoring lui-même (`scoring-engine.ts`) reste inchangé. Aligné
 * sur le seuil "à vérifier" des règles de scoring CRM par défaut
 * (`src/lib/scoring.ts#DEFAULT_SCORING_RULES`).
 */
const QUALIFICATION_SCORE_THRESHOLD = 40;

function parseInput(raw: unknown): QualificationAgentInput {
  const parsed = qualificationAgentInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      `Entrée invalide pour l'Agent Qualification : ${parsed.error.issues.map((issue) => issue.message).join(", ")}`
    );
  }
  return parsed.data;
}

/**
 * Agent Qualification (v1.1, AR-0173) — extrait de l'Agent Commercial pour
 * être orchestrable indépendamment (par un workflow/une automatisation qui
 * voudrait qualifier un prospect sans lancer tout le cycle commercial).
 * Réutilise EXACTEMENT les mêmes outils que l'Agent Commercial
 * (`commercial.score_prospect`, `commercial.qualify_prospect`, donc le même
 * `scoring-engine.ts` sous-jacent) — aucune logique de scoring dupliquée,
 * seule la décision de seuil (score -> étape) est propre à cet agent.
 */
export const qualificationAgentRuntime: AgentRuntime = {
  runtimeKey: QUALIFICATION_AGENT_RUNTIME_KEY,

  async execute(context) {
    const input = parseInput(context.input);
    await context.log("info", "Qualification demandée.", { prospectId: input.prospectId });

    const { score, breakdown } = (await context.callTool("commercial.score_prospect", {
      prospectId: input.prospectId,
      facts: input.facts,
    })) as { score: number; breakdown: unknown };

    const stage: CommercialStage = score >= QUALIFICATION_SCORE_THRESHOLD ? "QUALIFIED" : "TO_QUALIFY";
    await context.log("info", "Score calculé.", { score, stage });

    const { prospect } = (await context.callTool("commercial.qualify_prospect", {
      prospectId: input.prospectId,
      stage,
      notes: input.notes,
    })) as { prospect: unknown };

    await context.log("info", "Prospect qualifié.", { stage });

    return { output: { prospectId: input.prospectId, score, breakdown, stage, prospect } };
  },
};
