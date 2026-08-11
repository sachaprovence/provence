import "server-only";
import { generateStructured, isDemoMode, QUEST_AI_SYSTEM_PROMPT } from "./client";
import { GoalAnalysisSchema, type ClarifyingAnswer, type GoalAnalysis } from "./schemas";
import { detectDomainHandler } from "./domains/registry";

/**
 * Analyse d'objectif (§4 du brief, revu suite au retour terrain : le moteur
 * ne doit JAMAIS chercher à faire réfléchir l'utilisateur sur son objectif
 * quand il a déjà assez d'information pour agir). Distingue :
 *
 * 1. Objectif reconnu ET niveau déjà connu (dans le titre/la description,
 *    ou une action pertinente quel que soit le niveau) -> aucune question,
 *    analyse finale immédiate.
 * 2. Objectif reconnu mais niveau inconnu -> UNE question ciblée sur le
 *    niveau (`DomainHandler.levelQuestion`), jamais un questionnaire.
 * 3. Objectif vraiment vague (domaine non reconnu) -> clarification large
 *    (questions génériques existantes, au plus 5).
 *
 * Deux passes : sans `answers`, produit la question (ou l'analyse finale
 * directement si déjà suffisante) ; avec `answers`, produit toujours
 * l'analyse finale (`clarifyingQuestions` vide).
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

function finalAnalysis(title: string, currentState: string | null): GoalAnalysis {
  return GoalAnalysisSchema.parse({
    currentState,
    targetState: `Atteindre : ${title}.`,
    constraints: [],
    timeAvailable: null,
    deadlineHint: null,
    resources: [],
    blockers: [],
    successMetrics: [],
    clarifyingQuestions: [],
    difficultyEstimate: 3,
  });
}

function questionsAnalysis(questions: string[]): GoalAnalysis {
  return GoalAnalysisSchema.parse({
    currentState: null,
    targetState: null,
    constraints: [],
    timeAvailable: null,
    deadlineHint: null,
    resources: [],
    blockers: [],
    successMetrics: [],
    clarifyingQuestions: questions,
    difficultyEstimate: 3,
  });
}

function analyzeGoalDemo(input: AnalyzeGoalInput): GoalAnalysis {
  const answers = input.answers ?? [];
  const handler = detectDomainHandler(input.title, input.description);

  if (handler) {
    if (answers.length === 0) {
      if (handler.hasEnoughInfo(input.title, input.description, null)) {
        // Le niveau est déjà déductible du titre/de la description (ex. "je cours déjà 30 minutes") : ne jamais redemander.
        const currentState = handler.parseLevelAnswer(input.title, input.description, input.description ?? "");
        return finalAnalysis(input.title, currentState);
      }
      return questionsAnalysis([handler.levelQuestion(input.title, input.description)]);
    }
    const currentState = handler.parseLevelAnswer(input.title, input.description, answers[0]?.answer ?? "");
    return finalAnalysis(input.title, currentState);
  }

  if (answers.length === 0) {
    return questionsAnalysis(GENERIC_CLARIFYING_QUESTIONS);
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

  const domainHint = detectDomainHandler(input.title, input.description)?.domain ?? null;

  const prompt = `Objectif de l'utilisateur : "${input.title}"${input.description ? `\nDescription : ${input.description}` : ""}
${domainHint ? `\nDomaine détecté (indicatif, à confirmer par ton propre jugement) : ${domainHint}.` : ""}
${
  input.answers && input.answers.length > 0
    ? `\nRéponses de l'utilisateur aux questions de clarification :\n${input.answers.map((a) => `- ${a.question} -> ${a.answer}`).join("\n")}\n\nProduis l'analyse finale (clarifyingQuestions doit être vide, l'analyse est suffisante).`
    : `\nPRINCIPE CENTRAL : ne pose une question QUE si l'information manquante change réellement la première action à proposer (typiquement : le niveau actuel de l'utilisateur — durée qu'il peut déjà courir, répétitions qu'il peut déjà faire, niveau de langue, cigarettes/jour, épargne mensuelle possible...). Si l'objectif est déjà assez précis pour agir immédiatement (ex. "créer une entreprise de sites internet", "trouver 10 clients" — la première action a du sens quel que soit le niveau), laisse "clarifyingQuestions" vide et produis l'analyse directement. Si une info de niveau manque réellement, pose UNE SEULE question ciblée (jamais plusieurs, jamais génériques comme "que veux-tu accomplir ?"). Seulement si l'objectif est réellement vague (aucune cible concrète identifiable), pose jusqu'à 5 questions plus larges.`
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
