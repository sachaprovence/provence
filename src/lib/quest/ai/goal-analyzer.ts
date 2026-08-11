import "server-only";
import { generateStructured, isDemoMode, QUEST_AI_SYSTEM_PROMPT } from "./client";
import { GoalAnalysisSchema, type ClarifyingAnswer, type GoalAnalysis } from "./schemas";

/**
 * Analyse d'objectif (§4 du brief) — au plus 3 à 7 questions utiles, jamais
 * un questionnaire interminable. Deux passes : sans `answers`, produit les
 * questions de clarification ; avec `answers`, produit l'analyse finale
 * (état actuel/cible, contraintes, échéance, blocages, métriques de succès).
 */

export type AnalyzeGoalInput = {
  title: string;
  description: string | null;
  answers?: ClarifyingAnswer[];
};

const GENERIC_CLARIFYING_QUESTIONS = [
  "Où en es-tu aujourd'hui par rapport à cet objectif, concrètement ?",
  "Combien de temps peux-tu y consacrer chaque semaine ?",
  "As-tu une échéance en tête ? Si oui, laquelle ?",
  "Qu'est-ce qui t'a empêché d'avancer jusqu'ici, si quelque chose ?",
  "Comment sauras-tu, très concrètement, que tu as réussi ?",
];

function analyzeGoalDemo(input: AnalyzeGoalInput): GoalAnalysis {
  const answers = input.answers ?? [];
  if (answers.length === 0) {
    return GoalAnalysisSchema.parse({
      currentState: null,
      targetState: null,
      constraints: [],
      timeAvailable: null,
      deadlineHint: null,
      resources: [],
      blockers: [],
      successMetrics: [],
      clarifyingQuestions: GENERIC_CLARIFYING_QUESTIONS,
      difficultyEstimate: 3,
    });
  }

  const byQuestion = (needle: string) => answers.find((a) => a.question === needle)?.answer.trim() || null;

  return GoalAnalysisSchema.parse({
    currentState: byQuestion(GENERIC_CLARIFYING_QUESTIONS[0]) ?? "Non précisé.",
    targetState: `Atteindre : ${input.title}.`,
    constraints: [],
    timeAvailable: byQuestion(GENERIC_CLARIFYING_QUESTIONS[1]),
    deadlineHint: byQuestion(GENERIC_CLARIFYING_QUESTIONS[2]),
    resources: [],
    blockers: byQuestion(GENERIC_CLARIFYING_QUESTIONS[3]) ? [byQuestion(GENERIC_CLARIFYING_QUESTIONS[3])!] : [],
    successMetrics: byQuestion(GENERIC_CLARIFYING_QUESTIONS[4]) ? [byQuestion(GENERIC_CLARIFYING_QUESTIONS[4])!] : [],
    clarifyingQuestions: [],
    difficultyEstimate: 3,
  });
}

export async function analyzeGoal(input: AnalyzeGoalInput): Promise<GoalAnalysis> {
  if (isDemoMode()) return analyzeGoalDemo(input);

  const prompt = `Objectif de l'utilisateur : "${input.title}"${input.description ? `\nDescription : ${input.description}` : ""}
${
  input.answers && input.answers.length > 0
    ? `\nRéponses de l'utilisateur aux questions de clarification :\n${input.answers.map((a) => `- ${a.question} -> ${a.answer}`).join("\n")}\n\nProduis l'analyse finale (clarifyingQuestions doit être vide, l'analyse est suffisante).`
    : `\nAucune réponse encore. Si des informations manquantes ont un impact réel sur le plan (niveau, temps disponible, échéance, blocages connus, mesure de réussite), pose au maximum 7 questions utiles dans "clarifyingQuestions" (jamais plus, jamais un questionnaire générique inutile). Sinon laisse "clarifyingQuestions" vide.`
}

Réponds UNIQUEMENT avec un objet JSON au format exact :
{
  "currentState": string | null,
  "targetState": string | null,
  "constraints": string[],
  "timeAvailable": string | null,
  "deadlineHint": string | null,
  "resources": string[],
  "blockers": string[],
  "successMetrics": string[],
  "clarifyingQuestions": string[],
  "difficultyEstimate": number (1 à 5)
}`;

  return generateStructured({
    schema: GoalAnalysisSchema,
    system: QUEST_AI_SYSTEM_PROMPT,
    prompt,
    context: "goal-analyzer",
  });
}
