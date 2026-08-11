import "server-only";
import { generateStructured, isDemoMode, QUEST_AI_SYSTEM_PROMPT } from "./client";
import { GoalPlanSchema, type GoalAnalysis, type GoalPlan } from "./schemas";
import { detectDomainHandler } from "./domains/registry";

/**
 * Génère les grands jalons d'un objectif (§6 du brief) — vision globale
 * stable, PAS les quêtes détaillées (celles-ci viennent de
 * `quest-generator.ts`, régénérées au fil de l'eau). 3 à 8 jalons, poids
 * croissant vers la fin (les derniers jalons pèsent en général plus que les
 * premiers — "premier client" > "offre définie").
 *
 * Suite au retour terrain : en mode démo, les jalons doivent être
 * spécifiques au domaine de l'objectif (paliers de durée pour la course à
 * pied, étapes de prospection pour la vente...), jamais des gabarits
 * interchangeables ("Première action concrète", "Consolider et
 * accélérer"...) qui ne veulent rien dire pour un objectif précis.
 */

export type PlanGoalInput = {
  title: string;
  description: string | null;
  analysis: GoalAnalysis;
};

function planGoalDemo(input: PlanGoalInput): GoalPlan {
  const handler = detectDomainHandler(input.title, input.description);
  if (handler) {
    const milestones = handler.buildMilestones({
      title: input.title,
      description: input.description,
      currentStateText: input.analysis.currentState,
    });
    return GoalPlanSchema.parse({ milestones });
  }

  const goal = input.title;
  return GoalPlanSchema.parse({
    milestones: [
      { title: `Clarifier précisément la cible de "${goal}"`, description: "Définir une cible concrète et mesurable.", weight: 0.7 },
      { title: "Première action concrète", description: "Passer de l'intention à un premier pas réel, même petit.", weight: 1 },
      { title: "Construire une routine", description: "Répéter l'action jusqu'à ce qu'elle devienne régulière.", weight: 1.3 },
      { title: "Premier résultat mesurable", description: "Obtenir un premier signal tangible de progression.", weight: 1.7 },
      { title: "Consolider et accélérer", description: "Reproduire ce qui fonctionne, éliminer ce qui ne fonctionne pas.", weight: 2.2 },
    ],
  });
}

export async function planGoal(input: PlanGoalInput): Promise<GoalPlan> {
  if (isDemoMode()) return planGoalDemo(input);

  const domainHint = detectDomainHandler(input.title, input.description)?.domain ?? null;

  const prompt = `Objectif : "${input.title}"${input.description ? `\nDescription : ${input.description}` : ""}
Analyse déjà réalisée : ${JSON.stringify(input.analysis, null, 2)}
${domainHint ? `Domaine détecté (indicatif) : ${domainHint}.` : ""}

Découpe cet objectif en 3 à 8 grands jalons (vision globale stable, PAS des tâches détaillées). Chaque jalon doit être SPÉCIFIQUE à cet objectif précis (ex. pour "courir 1h à 10 km/h" : des paliers de durée courue sans s'arrêter ; pour "trouver 10 clients" : des étapes de prospection réelles) — jamais un gabarit générique interchangeable comme "première action concrète" ou "consolider et accélérer", qui pourrait s'appliquer à n'importe quel objectif. Chaque jalon a un poids relatif (0.5 à 5) reflétant son importance réelle dans la progression vers l'objectif.

Réponds UNIQUEMENT avec un objet JSON : { "milestones": [{ "title": string, "description": string | null, "weight": number }] }`;

  return generateStructured({
    schema: GoalPlanSchema,
    system: QUEST_AI_SYSTEM_PROMPT,
    prompt,
    context: "goal-planner",
  });
}
